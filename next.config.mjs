/** @type {import('next').NextConfig} */
const nextConfig = {
  // Momo se sirve detrás de un dominio propio (proxy de Vercel -> Railway) además de la
  // URL directa de Railway. Next.js valida el Origin de los Server Actions contra el host
  // real del servidor (CSRF); sin esto, el login/registro (Server Actions) fallan cuando
  // el navegador llega por reservas.momobook.cl.
  experimental: {
    serverActions: {
      allowedOrigins: ['reservas.momobook.cl', 'app-production-413d.up.railway.app'],
    },
  },
};
export default nextConfig;
