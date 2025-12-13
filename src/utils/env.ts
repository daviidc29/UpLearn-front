// Lee variables de entorno en CRA (process.env.REACT_APP_*) o Vite (import.meta.env)
const viteEnv = (import.meta !== undefined ? (import.meta as any).env : undefined) || {};

export const ENV = {
  // Base del scheduler
  SCHEDULER_BASE:
    viteEnv.VITE_SCHEDULER_BASE_URL ||
    process.env.REACT_APP_SCHEDULER_API_BASE ||
    'https://reinaldo-unconjured-edra.ngrok-free.dev',

  // Base del servicio de tareas
  TASKS_BASE:
    viteEnv.VITE_TASKS_BASE_URL ||
    process.env.REACT_APP_TASKS_API_BASE ||
    viteEnv.VITE_SCHEDULER_BASE_URL ||
    process.env.REACT_APP_SCHEDULER_API_BASE ||
    'https://reinaldo-unconjured-edra.ngrok-free.dev',

  // Base del users service. Para CRA ya incluye /Api-user
  USERS_BASE:
    viteEnv.VITE_USERS_BASE_URL ||
    process.env.REACT_APP_USER_API_BASE ||   // ej: http://localhost:8080/Api-user
    'https://user-service.duckdns.org/Api-user',

  // Ruta del endpoint público (si USERS_BASE ya incluye /Api-user, aquí solo /public/profile)
  USERS_PROFILE_PATH:
    viteEnv.VITE_USERS_PROFILE_PATH ||
    '/public/profile',

  // Base del payment service
  PAYMENT_BASE:
    viteEnv.VITE_PAYMENT_BASE_URL ||
    process.env.REACT_APP_PAYMENT_API_BASE ||
    'https://wallet-service.duckdns.org/api',
};
