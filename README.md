# UpLearn Frontend

Una página básica de React con TypeScript que incluye botones de login y registro.

## Características

- Interfaz moderna y responsive
- Componentes desarrollados en React con TypeScript (TSX)
- Estilos CSS personalizados con gradientes y efectos hover
- Botones de "Iniciar Sesión" y "Registrarse"
- Diseño centrado y atractivo

## Estructura del Proyecto

```
UpLearn-Front/
├── public/
│   └── index.html
├── src/
│   ├── HomePage.tsx       # Componente principal con botones
│   ├── HomePage.css       # Estilos del componente principal
│   ├── App.tsx           # Componente raíz
│   ├── App.css           # Estilos globales
│   └── index.tsx         # Punto de entrada de React
├── package.json
├── tsconfig.json
└── README.md
```

## Instalación y Ejecución

### Prerrequisitos
- Node.js (versión 14 o superior)
- npm

### Pasos para ejecutar

1. **Instalar dependencias:**
   ```bash
   npm install --legacy-peer-deps
   ```

2. **Iniciar el servidor de desarrollo:**
   ```bash
   npm start
   ```

3. **Abrir en el navegador:**
   La aplicación se abrirá automáticamente en `http://localhost:3000`

## 🎨 Funcionalidades

### Botones Interactivos
- **Iniciar Sesión**: Botón con gradiente azul-púrpura
- **Registrarse**: Botón con borde que cambia a relleno al hacer hover

### Efectos Visuales
- Gradiente de fondo
- Sombras y efectos hover
- Diseño responsive para dispositivos móviles
- Tipografía moderna

## Responsive Design

La aplicación está optimizada para:
- Escritorio (pantallas grandes)
- Tabletas (pantallas medianas)
- Móviles (pantallas pequeñas - menos de 480px)

## Tecnologías Utilizadas

- **React 18.2.0**: Biblioteca de JavaScript para construir interfaces de usuario
- **TypeScript 4.9.5**: Superset de JavaScript con tipado estático
- **React Scripts 5.0.1**: Herramientas de construcción y desarrollo
- **CSS3**: Estilos personalizados con Flexbox y Grid

## Scripts Disponibles

- `npm start`: Ejecuta la aplicación en modo desarrollo
- `npm build`: Construye la aplicación para producción
- `npm test`: Ejecuta las pruebas
- `npm eject`: Expone la configuración de webpack (no recomendado)
