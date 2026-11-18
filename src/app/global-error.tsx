'use client'

export default function GlobalError({
  unstable_retry,
}: {
  error: Error & { digest?: string }
  unstable_retry: () => void
}) {
  return (
    <html lang="en">
      <body
        style={{
          alignItems: 'center',
          background: '#f6f1eb',
          color: '#3c2c24',
          display: 'flex',
          fontFamily: 'system-ui, sans-serif',
          justifyContent: 'center',
          margin: 0,
          minHeight: '100vh',
          padding: 24,
        }}
      >
        <main
          style={{
            background: '#fffdfa',
            border: '1px solid #e2d7cd',
            borderRadius: 24,
            maxWidth: 520,
            padding: 32,
            textAlign: 'center',
          }}
        >
          <p style={{ color: '#a1846e', fontSize: 11, fontWeight: 800, letterSpacing: '.15em' }}>
            MIMI&apos;S TAILORING
          </p>
          <h1 style={{ fontFamily: 'Georgia, serif', fontSize: 28, margin: '12px 0' }}>
            The studio could not load
          </h1>
          <p style={{ color: '#806f63', fontSize: 14, lineHeight: 1.6 }}>
            Please retry the page. Your saved Supabase records have not been changed.
          </p>
          <button
            onClick={() => unstable_retry()}
            style={{
              background: '#49382d',
              border: 0,
              borderRadius: 12,
              color: '#fffaf5',
              fontWeight: 700,
              marginTop: 20,
              padding: '10px 18px',
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  )
}
