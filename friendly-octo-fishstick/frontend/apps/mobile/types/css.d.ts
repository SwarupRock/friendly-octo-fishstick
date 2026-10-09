// Ambient declarations for CSS imports in the Expo/React Native web target.

declare module '*.css';

declare module '*.module.css' {
  const classes: { readonly [key: string]: string };
  export default classes;
}
