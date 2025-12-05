import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import { AuthProvider } from "react-oidc-context";
import './styles/index.css';
const cognitoAuthConfig = {
  authority: "https://cognito-idp.us-east-1.amazonaws.com/us-east-1_8mvpRkbVu",
  client_id: "342s18a96gl2pbaroorqh316l8",
  redirect_uri: "http://localhost:3000",
  response_type: "code",
  scope: "email openid profile",
  extraQueryParams: {
    ui_locales: "es"
  },
};

const root = ReactDOM.createRoot(
  document.getElementById('root') as HTMLElement
);

root.render(
  <React.StrictMode>
    <AuthProvider {...cognitoAuthConfig}>
      <App />
    </AuthProvider>
  </React.StrictMode>
);