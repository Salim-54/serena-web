import type { TicketTechnician } from '../lib/tickets';

/** Technicians on a ticket with tap-to-call phone numbers. */
export default function TechnicianList({
  technicians,
  empty = 'Not assigned yet',
  inline = false,
  callable = true,
}: {
  technicians: TicketTechnician[];
  empty?: string;
  /** One line, comma-separated (lists); otherwise one per line (details). */
  inline?: boolean;
  /** false inside another link (a card), where a nested tel: link is invalid. */
  callable?: boolean;
}) {
  if (!technicians.length) return <span className="muted">{empty}</span>;
  return (
    <span className={inline ? 'tech-list inline' : 'tech-list'}>
      {technicians.map((t) => (
        <span key={t.id} className="tech">
          {t.name}
          {t.phone && !callable && <span className="tel">📞 {t.phone}</span>}
          {t.phone && callable && (
            <a
              className="tel"
              href={`tel:${t.phone.replace(/\s+/g, '')}`}
              onClick={(e) => e.stopPropagation()}
              aria-label={`Call ${t.name}`}
            >
              📞 {t.phone}
            </a>
          )}
        </span>
      ))}
    </span>
  );
}
