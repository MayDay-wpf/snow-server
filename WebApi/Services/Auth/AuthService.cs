using System.IdentityModel.Tokens.Jwt;
using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using Microsoft.AspNetCore.SignalR;
using Microsoft.EntityFrameworkCore;
using Microsoft.IdentityModel.Tokens;
using WebApi.Data;
using WebApi.Hubs;
using WebApi.Models;
using WebApi.Models.DTOs;

namespace WebApi.Services.Auth;

public class AuthService : IAuthService
{
    private readonly AppDbContext _context;
    private readonly IConfiguration _configuration;
    private readonly UserConnectionManager _connectionManager;
    private readonly IHubContext<InstanceHub, IInstanceClient> _hubContext;
    private readonly ILogger<AuthService> _logger;

    public AuthService(
        AppDbContext context, 
        IConfiguration configuration,
        UserConnectionManager connectionManager,
        IHubContext<InstanceHub, IInstanceClient> hubContext,
        ILogger<AuthService> logger)
    {
        _context = context;
        _configuration = configuration;
        _connectionManager = connectionManager;
        _hubContext = hubContext;
        _logger = logger;
    }

    public async Task<AuthResponse> RegisterAsync(RegisterRequest request)
    {
        // 检查用户名是否已存在
        if (await _context.Users.AnyAsync(u => u.Username == request.Username))
        {
            return new AuthResponse
            {
                Success = false,
                Message = "用户名已存在"
            };
        }

        var user = new User
        {
            Username = request.Username,
            PasswordHash = HashPassword(request.Password),
            CreatedAt = DateTime.UtcNow
        };

        _context.Users.Add(user);
        await _context.SaveChangesAsync();

        var token = GenerateJwtToken(user);
        var refreshToken = await GenerateRefreshTokenAsync(user.Id);

        return new AuthResponse
        {
            Success = true,
            Message = "注册成功",
            Token = token,
            RefreshToken = refreshToken.Token,
            User = new UserDto
            {
                Id = user.Id,
                Username = user.Username
            }
        };
    }

    public async Task<AuthResponse> LoginAsync(LoginRequest request)
    {
        var user = await _context.Users
            .FirstOrDefaultAsync(u => u.Username == request.Username);

        if (user == null || !VerifyPassword(request.Password, user.PasswordHash))
        {
            return new AuthResponse
            {
                Success = false,
                Message = "用户名或密码错误"
            };
        }

        var token = GenerateJwtToken(user);
        var refreshToken = await GenerateRefreshTokenAsync(user.Id);

        return new AuthResponse
        {
            Success = true,
            Message = "登录成功",
            Token = token,
            RefreshToken = refreshToken.Token,
            User = new UserDto
            {
                Id = user.Id,
                Username = user.Username
            }
        };
    }

    public async Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request)
    {
        var storedRefreshToken = await _context.RefreshTokens
            .Include(rt => rt.User)
            .FirstOrDefaultAsync(rt => rt.Token == request.RefreshToken);

        if (storedRefreshToken == null || storedRefreshToken.IsRevoked)
        {
            return new AuthResponse
            {
                Success = false,
                Message = "无效的刷新令牌"
            };
        }

        if (storedRefreshToken.ExpiresAt < DateTime.UtcNow)
        {
            return new AuthResponse
            {
                Success = false,
                Message = "刷新令牌已过期"
            };
        }

        // 撤销旧的刷新令牌
        storedRefreshToken.IsRevoked = true;

        // 生成新的令牌
        var newToken = GenerateJwtToken(storedRefreshToken.User);
        var newRefreshToken = await GenerateRefreshTokenAsync(storedRefreshToken.UserId);

        await _context.SaveChangesAsync();

        return new AuthResponse
        {
            Success = true,
            Message = "令牌刷新成功",
            Token = newToken,
            RefreshToken = newRefreshToken.Token,
            User = new UserDto
            {
                Id = storedRefreshToken.User.Id,
                Username = storedRefreshToken.User.Username
            }
        };
    }

    public async Task<AuthResponse> DeleteAccountAsync(int userId, DeleteAccountRequest request)
    {
        if (string.IsNullOrWhiteSpace(request.Password))
        {
            return new AuthResponse
            {
                Success = false,
                Message = "密码不能为空"
            };
        }

        var user = await _context.Users.FirstOrDefaultAsync(u => u.Id == userId);
        if (user == null)
        {
            return new AuthResponse
            {
                Success = false,
                Message = "用户不存在"
            };
        }

        if (!VerifyPassword(request.Password, user.PasswordHash))
        {
            return new AuthResponse
            {
                Success = false,
                Message = "密码错误"
            };
        }

        // 1. 撤销该用户所有的 RefreshToken
        var refreshTokens = await _context.RefreshTokens
            .Where(rt => rt.UserId == userId && !rt.IsRevoked)
            .ToListAsync();
        
        foreach (var token in refreshTokens)
        {
            token.IsRevoked = true;
        }
        
        _logger.LogInformation("用户 {UserId} 销毁账号：已撤销 {Count} 个刷新令牌", userId, refreshTokens.Count);

        // 2. 断开该用户所有已连接的实例
        var userInstances = _connectionManager.GetUserInstances(userId.ToString());
        foreach (var instance in userInstances)
        {
            try
            {
                // 通知实例被强制下线
                await _hubContext.Clients.Client(instance.ConnectionId).ReceiveForceOffline();
                _logger.LogInformation("用户 {UserId} 销毁账号：已断开实例 {InstanceId}", userId, instance.InstanceId);
            }
            catch (Exception ex)
            {
                _logger.LogWarning(ex, "用户 {UserId} 销毁账号：断开实例 {InstanceId} 时发生异常", userId, instance.InstanceId);
            }
        }
        
        // 从连接管理器中移除所有连接
        foreach (var instance in userInstances)
        {
            _connectionManager.RemoveConnection(instance.ConnectionId);
        }
        
        _logger.LogInformation("用户 {UserId} 销毁账号：已断开 {Count} 个实例连接", userId, userInstances.Count);

        // 3. 删除用户账号（级联删除会自动删除 RefreshTokens 记录）
        _context.Users.Remove(user);
        await _context.SaveChangesAsync();

        _logger.LogInformation("用户 {UserId} ({Username}) 账号已成功销毁", userId, user.Username);

        return new AuthResponse
        {
            Success = true,
            Message = "账号已销毁"
        };
    }

    public string HashPassword(string password)
    {
        using var sha256 = SHA256.Create();
        var bytes = sha256.ComputeHash(Encoding.UTF8.GetBytes(password + _configuration["Jwt:Key"]));
        return Convert.ToBase64String(bytes);
    }

    public bool VerifyPassword(string password, string hash)
    {
        return HashPassword(password) == hash;
    }

    private string GenerateJwtToken(User user)
    {
        var jwtKey = _configuration["Jwt:Key"] ?? "DefaultSecretKeyForDevelopment2024!";
        var key = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtKey));
        var credentials = new SigningCredentials(key, SecurityAlgorithms.HmacSha256);

        var expirationMinutes = _configuration.GetValue<int>("Jwt:AccessTokenExpirationMinutes", 15);

        var claims = new[]
        {
            new Claim(ClaimTypes.NameIdentifier, user.Id.ToString()),
            new Claim(ClaimTypes.Name, user.Username),
            new Claim(JwtRegisteredClaimNames.Jti, Guid.NewGuid().ToString())
        };

        var token = new JwtSecurityToken(
            issuer: _configuration["Jwt:Issuer"] ?? "WebApi",
            audience: _configuration["Jwt:Audience"] ?? "WebApi",
            claims: claims,
            expires: DateTime.UtcNow.AddMinutes(expirationMinutes),
            signingCredentials: credentials
        );

        return new JwtSecurityTokenHandler().WriteToken(token);
    }

    private async Task<RefreshToken> GenerateRefreshTokenAsync(int userId)
    {
        var refreshToken = new RefreshToken
        {
            Token = Convert.ToBase64String(RandomNumberGenerator.GetBytes(64)),
            UserId = userId,
            ExpiresAt = DateTime.UtcNow.AddDays(_configuration.GetValue<int>("Jwt:RefreshTokenExpirationDays", 7)),
            CreatedAt = DateTime.UtcNow
        };

        _context.RefreshTokens.Add(refreshToken);
        await _context.SaveChangesAsync();

        return refreshToken;
    }
}
