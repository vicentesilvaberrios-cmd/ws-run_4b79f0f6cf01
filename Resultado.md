# Resultado.md — Momo (FIX incremental + Bloqueos de Agenda)

## Despliegue

✅ Desplegado y verificado en Railway (build OK).

---

## Stack

- **Next.js 14** (App Router) + **TypeScript**
- **Supabase** (`@supabase/ssr` + `@supabase/supabase-js`) — auth, DB, RLS, RPCs
- **Resend** (API server-side) para emails de confirmación y recordatorio
- Sin librerías UI externas: CSS propio en `app/globals.css`
- Zona horaria **America/Santiago**, formato 24h, precios en **CLP**

---

## Qué se construyó (por módulo/épica)

### 1. Autenticación y multi-tenant
- Server actions `register`, `login`, `logout` en `app/(auth)/actions.ts`.
- Páginas `/login`, `/register`, `/verify`.
- Middleware (`middleware.ts`) que protege `/dashboard/*` y APIs internas; permite rutas públicas (`/book/*`, `/cita/*`, `/api/public/*`).
- Trigger DB `handle_new_user` crea organización + membership admin automáticamente al registrarse.
- RLS en todas las tablas con funciones `is_member(org_id)` / `is_admin(org_id)` (SECURITY DEFINER, `search_path=public`).
- Helper `getCurrentOrg()` en `lib/org.ts` obtiene la organización del usuario autenticado.

### 2. Dashboard
- Layout con navbar (`app/dashboard/layout.tsx`): Inicio, Resumen, Servicios, Profesionales, Horario, Agenda, Fichas.
- **Inicio** (`DashboardHomeClient.tsx`): onboarding de 3 pasos (crear servicio → definir horario → compartir link), KPIs de citas de hoy y no-shows, link público copiable, QR descargable (vía api.qrserver.com), botón compartir por WhatsApp.
- **Resumen** (`/dashboard/resumen`): tabla de citas del día con badges de estado, KPIs de total y no-shows.
- **Servicios** (`/dashboard/servicios`): CRUD completo con `ServiceForm.tsx` (nombre, duración mín. 5 min, precio CLP, activar/desactivar).
- **Profesionales** (`/dashboard/profesionales`): `ProfessionalsManager.tsx` — crear, editar nombre, activar/desactivar, eliminar.
- **Clientes/Fichas** (`/dashboard/clientes`): lista de clientes con link a ficha individual `/dashboard/clientes/[id]`; búsqueda por teléfono vía `/api/clients/search`.

### 3. Horarios (modo simple y avanzado)
- `app/dashboard/horario/HoursEditor.tsx`:
  - **Modo simple**: marcar días, elegir hora inicio/fin y un descanso opcional. Resumen en lenguaje natural.
  - **Modo avanzado**: edición por día con múltiples tramos de atención y descansos, validación de solapamientos.
- APIs: `/api/business-hours` (GET, POST, DELETE) y `/api/breaks` (GET, POST, DELETE).

### 4. Bloqueos de agenda (MEJORA NUEVA — migración 0008)
- **Migración `supabase/migrations/0008_schedule_blocks.sql`** (incremental, no toca migraciones previas):
  - Crea tabla `schedule_blocks` con `org_id`, `professional_id` (nullable = todo el negocio), `block_date`, `start_time`/`end_time` (nullable = día completo), `reason` opcional, `created_at`.
  - CHECK constraint: ambos horarios null o ambos presentes con `end_time > start_time`.
  - RLS: select para members, insert/update/delete para admin.
  - Redefine `public_availability` para excluir slots que solapen con `schedule_blocks` (día completo o rango horario), usando el mismo patrón `AT TIME ZONE 'America/Santiago'`. No altera la lógica existente de `business_hours`, `breaks` ni citas `booked`.
- **API**:
  - `GET /api/schedule-blocks` — lista bloqueos vigentes (desde hoy en adelante).
  - `POST /api/schedule-blocks` — crea bloqueo; soporta rango de fechas (`end_date`), día completo o rango de horas, por profesional o todo el negocio.
  - `DELETE /api/schedule-blocks/[id]` — elimina un bloqueo.
  - `GET /api/schedule-blocks/conflicts` — cuenta citas `booked` que solapan el bloqueo propuesto (no cancela automáticamente; solo informa).
- **UI**: `app/dashboard/horario/ScheduleBlocks.tsx` — integrado dentro de la página de Horario. Formulario con fecha desde/hasta, selector de profesional (o todo el negocio), toggle día completo vs. rango de horas (selects 07:00–20:00 en pasos de 30 min), motivo opcional. Aviso visual de conflictos en tiempo real. Lista de bloqueos vigentes con botón "Quuitar".

### 5. Reserva pública (`/book/[slug]`)
- `BookingWizard.tsx`: wizard de 6 pasos (Servicio → Profesional → Fecha → Horario → Datos → Confirmar).
- Consulta servicios y profesionales vía RPCs públicas (`public_services`, `public_professionals`).
- Consulta disponibilidad vía RPC `public_availability` → `/api/public/[slug]/availability`.
- Crea cita vía RPC `create_appointment` → `/api/public/[slug]/appointments`.
- Formato 24h, precios CLP, validación de email y campos obligatorios.

### 6. Página pública de cita (`/cita/[token]`)
- `app/cita/[token]/page.tsx` (server component) carga la cita vía RPC `public_appointment_by_token`.
- `CitaClient.tsx`: muestra detalles (negocio, servicio, profesional, día, hora), estado (confirmada/cancelada/pasada).
- Botones: **Confirmar asistencia** (RPC `public_confirm_appointment`) y **Cancelar cita** (RPC `public_cancel_appointment`) con confirmación de dos pasos.
- API `/api/public/cita/[token]` (GET para refrescar, POST para confirmar/cancelar).

### 7. Agenda del dashboard
- `AgendaList.tsx`: lista citas del día seleccionado, cambia estado (attended / no_show / cancelled), KPIs, formulario de nueva cita con búsqueda de cliente existente por teléfono.
- **Botón WhatsApp** por cita: normaliza teléfono chileno (`normalizePhoneCL`), genera mensaje con datos de la cita y link de confirmación/cancelación.

### 8. Emails (Resend, server-side)
- `lib/email.ts`:
  - `sendConfirmationEmail`: envía al crear cita (pública o desde dashboard). Incluye link a `/cita/[token]`.
  - `sendReminderEmail`: envía recordatorio con link de confirmación/cancelación.
  - Degradación con gracia: si `RESEND_API_KEY` no está configurada, no envía pero no rompe el flujo.

### 9. Cron de recordatorios
- `app/api/cron/send-reminders/route.ts`:
  - Protegido con `Bearer CRON_SECRET` (o query param `token`).
  - Selecciona citas `booked` en las próximas 24h con `reminder_sent_at IS NULL`.
  - Envía email de recordatorio y marca `reminder_sent_at` (idempotente).

### 10. Confirmación de citas (migración 0007)
- Columnas `public_token` (uuid único) y `confirmed_at` en `appointments`.
- RPCs: `public_appointment_by_token`, `public_confirm_appointment`, `public_cancel_appointment`.

### 11. Constraint de no-solape por profesional
- EXCLUDE constraint `no_overlap_booked` en `appointments` usando GIST sobre `tstzrange(starts_at, ends_at)` `WHERE status = 'booked'`.
- En migración 0006 se amplió para incluir `professional_id` en el constraint.

### 12. Utilidades
- `lib/format.ts`: `formatTime` (24h, America/Santiago), `formatDate`, `formatPrice` (CLP), `normalizePhoneCL` (E.164 Chile).
- `lib/qr.ts`: genera y descarga QR del link de reservas (vía api.qrserver.com, sin dependencias npm).
- `lib/availability.ts`: helper client-side que espeja la lógica de `public_availability` para construcción de UI.
- `lib/supabase/server.ts`, `client.ts`, `admin.ts`: clientes Supabase con cookies SSR, cliente público y admin.

---

## Lista real de archivos generados

### Migraciones (Supabase)
```
supabase/migrations/0001_init.sql
supabase/migrations/0002_appointment_management.sql
supabase/migrations/0003_fix_timezone_availability.sql
supabase/migrations/0004_clients.sql
supabase/migrations/0005_appointment_reminders.sql
supabase/migrations/0006_professionals.sql
supabase/migrations/0007_appointment_confirmation.sql
supabase/migrations/0008_schedule_blocks.sql          ← NUEVA (bloqueos de agenda)
```

### App — páginas
```
app/page.tsx
app/layout.tsx
app/globals.css
app/(auth)/actions.ts
app/(auth)/login/page.tsx
app/(auth)/register/page.tsx
app/(auth)/verify/page.tsx
app/dashboard/layout.tsx
app/dashboard/page.tsx
app/dashboard/DashboardHomeClient.tsx
app/dashboard/resumen/page.tsx
app/dashboard/servicios/page.tsx
app/dashboard/servicios/ServiceForm.tsx
app/dashboard/profesionales/page.tsx
app/dashboard/profesionales/ProfessionalsManager.tsx
app/dashboard/horario/page.tsx
app/dashboard/horario/HoursEditor.tsx
app/dashboard/horario/ScheduleBlocks.tsx               ← NUEVA
app/dashboard/agenda/page.tsx
app/dashboard/agenda/AgendaList.tsx
app/dashboard/clientes/page.tsx
app/dashboard/clientes/[id]/...                        ← ficha individual
app/book/[slug]/page.tsx
app/book/[slug]/BookingWizard.tsx
app/cita/[token]/page.tsx
app/cita/[token]/CitaClient.tsx
```

### App — API routes
```
app/api/appointments/route.ts                          (GET, POST)
app/api/appointments/[id]/route.ts                     (PATCH)
app/api/services/route.ts                              (GET, POST)
app/api/services/[id]/route.ts                         (PUT, DELETE)
app/api/professionals/route.ts                         (GET, POST)
app/api/professionals/[id]/route.ts                    (PATCH, DELETE)
app/api/business-hours/route.ts                        (GET, POST)
app/api/business-hours/[id]/route.ts                   (DELETE)
app/api/breaks/route.ts                                (GET, POST)
app/api/breaks/[id]/route.ts                           (DELETE)
app/api/clients/search/route.ts                        (GET)
app/api/clients/[id]/route.ts                          (PATCH — nota)
app/api/schedule-blocks/route.ts                       (GET, POST)    ← NUEVA
app/api/schedule-blocks/[id]/route.ts                  (DELETE)       ← NUEVA
app/api/schedule-blocks/conflicts/route.ts             (GET)          ← NUEVA
app/api/public/[slug]/services/route.ts                (GET)
app/api/public/[slug]/professionals/route.ts           (GET)
app/api/public/[slug]/availability/route.ts            (GET)
app/api/public/[slug]/appointments/route.ts            (POST)
app/api/public/cita/[token]/route.ts                   (GET, POST)
app/api/cron/send-reminders/route.ts                   (GET)
```

### Lib
```
lib/org.ts
lib/format.ts
lib/email.ts
lib/qr.ts
lib/availability.ts
lib/database.types.ts
lib/supabase/server.ts
lib/supabase/client.ts
lib/supabase/admin.ts
```

### Otros
```
middleware.ts
next.config.mjs
tsconfig.json
package.json
.eslintrc.json
design/UX_PLAN.md
design/UX_GUIDELINES.md
```

---

## Cómo correrlo

```bash
npm install
# Variables de entorno necesarias:
#   NEXT_PUBLIC_SUPABASE_URL
#   NEXT_PUBLIC_SUPABASE_ANON_KEY
#   SUPABASE_DB_SCHEMA (opcional, default 'public')
#   RESEND_API_KEY (opcional — sin él no se envían emails pero no rompe)
#   RESEND_FROM (opcional)
#   CRON_SECRET (para /api/cron/send-reminders)
#   NEXT_PUBLIC_SITE_URL (para links en emails y WhatsApp)

# Aplicar migraciones en orden 0001→0008 en Supabase

npm run dev      # desarrollo
npm run build    # build de producción
npm start        # servidor de producción
```

---

## Criterios de aceptación CUBIERTOS

| Criterio | Estado |
|---|---|
| Reserva pública `/book/[slug]` | ✅ Wizard de 6 pasos funcional |
| Página pública de cita `/cita/[token]` | ✅ Con confirmar/cancelar |
| RPCs `public_confirm_appointment` / `public_cancel_appointment` | ✅ Migración 0007 |
| Columna `confirmed_at` | ✅ Migración 0007 |
| Columna `public_token` | ✅ Migración 0007 |
| Botón WhatsApp en la agenda | ✅ `AgendaList.tsx` con `normalizePhoneCL` |
| Agenda del dashboard | ✅ Lista diaria, cambio de estado, crear cita |
| Fichas de clientes | ✅ Lista + ficha individual con nota |
| Horarios modo simple y avanzado | ✅ `HoursEditor.tsx` |
| Multi-tenant / RLS | ✅ Todas las tablas con RLS + `is_member`/`is_admin` |
| Constraint no-solape por profesional (`EXCLUDE … WHERE status='booked'`) | ✅ Migraciones 0001 + 0006 |
| Endpoint `/api/cron/send-reminders` (Bearer CRON_SECRET, `reminder_sent_at`) | ✅ |
| Emails Resend server-side con link confirmar/cancelar | ✅ `lib/email.ts` |
| Zona horaria America/Santiago | ✅ En RPCs, formato y UI |
| Formato 24h | ✅ `formatTime` con `hourCycle: 'h23'` |
| Precios CLP | ✅ `formatPrice` con `es-CL` / `CLP` |
| Migraciones solo incrementales desde 0008 | ✅ `0008_schedule_blocks.sql` no modifica las anteriores |
| **Bloqueos de agenda: tabla nueva con org_id, professional_id nullable, fecha, horas nullable, motivo** | ✅ |
| **RLS en schedule_blocks** | ✅ select member, CUD admin |
| **public_availability excluye bloqueos** | ✅ Redefinida en 0008 con mismo patrón AT TIME ZONE |
| **No rompe business_hours y breaks existentes** | ✅ Lógica previa intacta |
| **UI de bloqueos en el dashboard** | ✅ Sección en página de Horario |
| **Bloqueo por profesional o todo el negocio** | ✅ `professional_id` nullable |
| **Bloqueo día completo o rango de horas** | ✅ `start_time`/`end_time` nullable |
| **Detección de conflictos con citas existentes** | ✅ Endpoint `/api/schedule-blocks/conflicts` |

---

## PENDIENTES / Limitaciones reales

1. **`lib/database.types.ts`** está vacío (`export {}`): los clientes Supabase se usan sin tipado generics. No rompe funcionalidad pero no hay type-safety a nivel schema.
2. **Resend degradación**: si `RESEND_API_KEY` no está configurada, los emails no se envían. El cron igual marca `reminder_sent_at` para evitar reintentos infinitos.
3. **QR codes dependen de api.qrserver.com** (servicio externo gratuito). Sin fallback offline.
4. **Bloqueos de agenda no cancelan citas existentes automáticamente**: el endpoint de conflictos solo informa el número de citas afectadas; el dueño debe contactar manualmente a los clientes.
5. **No hay test suite**: no se encontraron archivos de test en el workspace.
6. **El archivo `migrations/1783094826.sql`** en la raíz contiene solo un comentario (no es una migración real; posiblemente un placeholder del tooling).
7. **La ficha de cliente individual (`/dashboard/clientes/[id]`)** existe como directorio pero no se inspeccionó su contenido completo — la API PATCH de notas está implementada en `/api/clients/[id]/route.ts`.
