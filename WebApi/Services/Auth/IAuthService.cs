using WebApi.Models.DTOs;

namespace WebApi.Services.Auth;

public interface IAuthService
{
    Task<AuthResponse> RegisterAsync(RegisterRequest request);
    Task<AuthResponse> LoginAsync(LoginRequest request);
    Task<AuthResponse> RefreshTokenAsync(RefreshTokenRequest request);
    Task<AuthResponse> DeleteAccountAsync(int userId, DeleteAccountRequest request);
    string HashPassword(string password);
    bool VerifyPassword(string password, string hash);
}
