# Solicitud de cambios (modo fix)

Momo (FIX incremental). NO rompas lo existente: reserva publica (/book/[slug]), pagina publica de cita (/cita/[token] con confirmar/cancelar via RPCs public_confirm_appointment y public_cancel_appointment, columna confirmed_at, token public_token), boton WhatsApp de la agenda, agenda, fichas de clientes, horarios (modo simple y avanzado), multi-tenant/RLS, constraint de no-solape POR PROFESIONAL (EXCLUDE ... WHERE status='booked'), endpoint /api/cron/send-reminders (Bearer CRON_SECRET, reminder_sent_at), emails Resend server-side con link de confirmar/cancelar, zona horaria America/Santiago, formato 24h, precios CLP. Migraciones: SOLO incrementales nuevas (desde 0008), no modifiques las anteriores. Agrega TRES mejoras:

1) BLOQUEOS DE AGENDA (dias u horas no disponibles):
- El dueno puede bloquear: un dia completo (feriado, vacaciones, enfermedad) o un rango de horas de un dia (tramite personal), por profesional o para todo el negocio.
- Tabla nueva (migracion incremental) con org_id, professional_id nullable (null = todo el negocio), fecha, hora inicio/fin nullable (null = dia completo), motivo opcional corto. RLS igual que el resto.
- La disponibilidad publica (public_availability) debe EXCLUIR los horarios bloqueados; cuidado con la zona horaria America/Santiago (mismo patron '(date || time)::timestamp AT TIME ZONE ...' ya usado). No rompas los casos existentes de business_hours y breaks.
- UI en el dashboard (puede ser una seccion en Horario o en Agenda, elige lo mas simple): "Bloquear fechas" con el minimo de clicks: elegir fecha (o rango de fechas para vacaciones), opcion "todo el dia" marcada por defecto, o desmarcar y elegir desde/hasta con selects acotados 07:00-20:00 en pasos de 30 min. Lista de bloqueos vigentes con boton quitar. Si hay citas ya reservadas en el rango bloqueado, ADVIERTELO mostrando cuantas (no las canceles automaticamente).

2) COMPARTIR EL LINK DE RESERVAS:
- En el inicio del dashboard (o en un lugar visible siempre), una tarjeta "Tu link de reservas" que muestre la URL publica de reservas del negocio (usa NEXT_PUBLIC_SITE_URL como base, fallback al origin actual) con: boton "Copiar link" (con feedback "Copiado"), boton "Compartir por WhatsApp" (wa.me con texto pre-armado invitando a reservar), y un codigo QR del link (generalo sin dependencias pesadas: una libreria minima de QR o SVG propio) con boton "Descargar QR" para imprimirlo.
- Texto de guia corto explicando para que sirve ("Compartelo en Instagram, WhatsApp o pegalo impreso en tu local").

3) ONBOARDING "DEJA TU AGENDA LISTA" (primera vez):
- Cuando el dueno entra y su negocio aun NO tiene servicios o NO tiene horario configurado, muestra en el inicio del dashboard un asistente de primeros pasos con 3 pasos claros y estado de avance: 1. Crea tu primer servicio -> 2. Define tu horario -> 3. Comparte tu link. Cada paso con boton directo a la pantalla correspondiente y check verde cuando este completo.
- No dupliques formularios: reutiliza las pantallas existentes de servicios y horario; el asistente solo guia y muestra progreso.
- Lenguaje simple, sin jerga, con la menor cantidad de pasos posible. Cuando los 3 pasos esten completos, el asistente se reemplaza por la tarjeta "Tu link de reservas" de la mejora 2.

UX (obligatorio): minimo de clicks, defaults precargados, selects acotados, un solo boton primario por pantalla, tooltips .help-tip donde ayude, estados vacio/carga/error, instructivo .steps si el flujo lo amerita, mobile-first. Alcance acotado a estas tres mejoras.