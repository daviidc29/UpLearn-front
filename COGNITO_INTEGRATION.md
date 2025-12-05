# Integración Frontend-Backend con Cognito

## Resumen

La Implementacion permite que el frontend envíe automáticamente el token de Cognito al backend cuando un usuario accede a su dashboard después de autenticarse.

## ¿Cómo funciona?

### 1. Servicio API (`src/service/Api-user.js`)

Se agregó un nuevo método `processCognitoUser()` que:
- Recibe el token de Cognito del frontend
- Lo envía al endpoint `/Api-user/process-cognito-user` del backend
- Retorna la información del usuario procesado

### 2. Hook personalizado (`src/utils/useCognitoIntegration.ts`)

Un hook reutilizable que:
- Detecta automáticamente cuando un usuario se autentica con Cognito
- Envía el token al backend una sola vez por sesión
- Maneja estados de carga y errores
- Proporciona feedback visual del proceso

### 3. Dashboards actualizados

Tanto `StudentDashboard` como `TutorDashboard` ahora:
- Importan y utilizan el hook `useCognitoIntegration`
- Muestran indicadores visuales del estado de sincronización
- Procesan automáticamente al usuario cuando acceden al dashboard

## Flujo completo

1. Usuario se autentica con Cognito
2. Usuario es redirigido a su dashboard correspondiente
3. El hook `useCognitoIntegration` detecta la autenticación
4. Se envía automáticamente el token al backend
5. El backend procesa el token y retorna información del usuario
6. Se muestra un indicador visual del resultado

## Archivos modificados

- `src/service/Api-user.js` - Agregado método `processCognitoUser()`
- `src/utils/useCognitoIntegration.ts` - Nuevo hook personalizado
- `src/pages/StudentDashboard.tsx` - Integración automática
- `src/pages/TutorDashboard.tsx` - Integración automática