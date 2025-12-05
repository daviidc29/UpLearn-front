# Configuración de AWS Cognito para UpLearn

## Implementación Completada

React ahora está configurada para usar AWS Cognito para la autenticación. Se han implementado las siguientes funcionalidades:

### Funcionalidades Implementadas

1. **Autenticación con AWS Cognito**
   - Redirección automática a la interfaz de login de Cognito
   - Manejo de estados de carga y errores
   - Redirección automática después del login

2. **Redirección Basada en Roles**
   - Estudiantes → `/student-dashboard`
   - Tutores → `/tutor-dashboard`
   - El rol se extrae del token JWT de Cognito

3. **Rutas Protegidas**
   - Verificación de autenticación para rutas sensibles
   - Control de acceso basado en roles
   - Redirección automática para usuarios no autorizados

4. **Gestión de Sesiones**
   - Logout local (elimina tokens del navegador)
   - Logout completo de Cognito (cierra sesión en el servidor)
   - Verificación automática del estado de autenticación


### Archivos Modificados

- `src/index.tsx` - Configuración del AuthProvider
- `src/App.tsx` - Rutas protegidas y redirección por roles
- `src/pages/LoginPage.tsx` - Nueva página de login con Cognito
- `src/pages/HomePage.tsx` - Información de autenticación
- `src/utils/tokenUtils.ts` - Utilidades para decodificar tokens (NUEVO)
- `src/styles/LoginPage.css` - Estilos actualizados
- `src/styles/HomePage.css` - Estilos actualizados
