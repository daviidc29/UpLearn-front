/**
 * Decode JWT token and extract user role
 * @param token - JWT token from Cognito
 * @returns user role or null if not found
 */
export const getUserRoleFromToken = (token: string): string | null => {
  try {
    // Split the token and get the payload
    const parts = token.split('.');
    if (parts.length !== 3) {
      console.error('Invalid JWT token format');
      return null;
    }

    // Decode the payload (base64url)
    const payload = parts[1];
    // Fix base64 padding issues
    const paddedPayload = payload + '='.repeat((4 - payload.length % 4) % 4);
    const decodedPayload = atob(paddedPayload.replace(/-/g, '+').replace(/_/g, '/'));
    const tokenData = JSON.parse(decodedPayload);

    // Extract role from token - adjust this based on how your Cognito stores the role
    const role = tokenData['custom:role'] || 
                 tokenData['cognito:groups']?.[0] || 
                 tokenData.role ||
                 tokenData['custom:user_type'];

    return role || null;
  } catch (error) {
    console.error('Error decoding token:', error);
    return null;
  }
};

/**
 * Check if user is authenticated and has a valid role
 * @param user - User object from react-oidc-context
 * @returns object with authentication status and role
 */
export const getUserAuthInfo = (user: any) => {
  if (!user || !user.id_token) {
    return {
      isAuthenticated: false,
      role: null,
      redirectPath: '/login'
    };
  }

  const role = getUserRoleFromToken(user.id_token);
  
  let redirectPath = '/';
  if (role === 'student') {
    redirectPath = '/student-dashboard';
  } else if (role === 'tutor') {
    redirectPath = '/tutor-dashboard';
  }

  return {
    isAuthenticated: true,
    role,
    redirectPath
  };
};