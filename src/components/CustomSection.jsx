/**
 * A container built in the admin dashboard ("Add container"). Text fields
 * render as paragraphs (blank lines split them); image fields render
 * full-width, with the field's label as alt text. Field labels on text
 * fields are for the admin's reference only.
 */
export default function CustomSection({ container }) {
  if (!container) return null

  const fields = (container.fields || []).filter((f) => (f.value || '').trim())

  // Nothing written yet (or everything deleted) — stay off the page.
  if (!container.title && fields.length === 0) return null

  return (
    <section className="section rise">
      {container.title && (
        <div className="section__head">
          <h2 className="section__title">{container.title}</h2>
        </div>
      )}

      <div className={`custom-copy custom-copy--${container.accent || 'navy'}`}>
        {fields.map((f, i) =>
          f.type === 'image' ? (
            <img
              key={f.id || i}
              className="custom-copy__img"
              src={f.value.trim()}
              alt={f.label || ''}
              loading="lazy"
            />
          ) : (
            // One cell per field, so fields sit side by side on wide
            // screens instead of stacking into one long column.
            <div key={f.id || i} className="custom-copy__item">
              {f.value
                .split('\n')
                .map((s) => s.trim())
                .filter(Boolean)
                .map((p, j) => (
                  <p key={j}>{p}</p>
                ))}
            </div>
          ),
        )}
      </div>
    </section>
  )
}
