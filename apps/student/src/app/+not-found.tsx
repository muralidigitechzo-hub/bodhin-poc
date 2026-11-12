import { Redirect } from 'expo-router';
/** Unknown path (e.g. preview host paths) → start the app from the splash. */
export default function NotFound() {
  return <Redirect href="/" />;
}
