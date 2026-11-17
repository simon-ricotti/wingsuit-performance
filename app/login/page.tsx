import { LoginForm } from './form';

export const metadata = { title: 'Ingresar · Wingsuit Performance' };

export default function LoginPage() {
  return (
    <main>
      <h1>Ingresar</h1>
      <p className="sub">Para organizadores, jueces y pilotos. Te mandamos un enlace por mail; no hace falta contraseña.</p>
      <LoginForm />
    </main>
  );
}
