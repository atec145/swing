import type { Metadata } from 'next'

// Privacy policy for the Swing Android app and this web version (issue #19).
// Google Play requires a publicly reachable URL; the app repo is private, so
// the page lives here.

export const metadata: Metadata = {
  title: 'Datenschutzerklärung – Swing',
  description: 'Datenschutzerklärung für die Swing-App (Android) und die Webversion',
}

const STAND = '4. Oktober 2026'

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-slate-100">{title}</h2>
      {children}
    </section>
  )
}

export default function Datenschutz() {
  return (
    <main className="min-h-screen bg-[#070910] px-4 py-12 text-slate-300">
      <article className="mx-auto max-w-2xl space-y-8 leading-relaxed">
        <header className="space-y-2">
          <p className="text-sm tracking-[0.3em] text-slate-500">SWING</p>
          <h1 className="text-3xl font-bold text-slate-100">Datenschutzerklärung</h1>
          <p className="text-sm text-slate-500">Stand: {STAND}</p>
        </header>

        <p>
          Diese Datenschutzerklärung gilt für das Spiel „Swing“ als Android-App
          und als Webversion unter swing-lemon.vercel.app. Swing kommt ohne
          Benutzerkonto, ohne Werbung und ohne Werbe- oder Analyse-SDKs von
          Drittanbietern aus.
        </p>

        <Section title="Verantwortlicher">
          <p>
            Andreas Fürst
            <br />
            E-Mail:{' '}
            <a className="text-cyan-400 underline" href="mailto:atec@gmx.at">
              atec@gmx.at
            </a>
          </p>
        </Section>

        <Section title="Bestenliste">
          <p>
            Wenn du nach einem Spiel freiwillig einen Eintrag in die Bestenliste
            speicherst, werden der von dir gewählte Name (max. 20 Zeichen), dein
            Punktestand und der Zeitpunkt gespeichert. Der Name ist für alle
            Spieler in der Bestenliste sichtbar – verwende daher bitte keinen
            echten Namen, wenn du das nicht möchtest. Ohne Eintrag werden keine
            Spielstände übertragen.
          </p>
          <p>
            Rechtsgrundlage ist deine Einwilligung (Art. 6 Abs. 1 lit. a DSGVO),
            die du durch das Absenden des Eintrags erteilst. Die Einträge bleiben
            gespeichert, bis du ihre Löschung verlangst.
          </p>
        </Section>

        <Section title="Lokale Einstellungen (App)">
          <p>
            Die App speichert nur auf deinem Gerät, ob der Ton stummgeschaltet
            ist. Diese Einstellung verlässt dein Gerät nicht.
          </p>
        </Section>

        <Section title="Anonyme Spielstatistik (nur Webversion)">
          <p>
            Die Webversion speichert im Browser (localStorage) eine zufällig
            erzeugte Sitzungs-ID. Am Ende jedes Spiels werden diese ID, der
            Punktestand, die Spieldauer und die laufende Nummer des Spiels
            übertragen. Daraus lässt sich nicht auf deine Person schließen; wir
            nutzen die Daten nur, um das Spiel zu verbessern (berechtigtes
            Interesse, Art. 6 Abs. 1 lit. f DSGVO). Du kannst die ID jederzeit
            löschen, indem du die Websitedaten in deinem Browser löschst. Die
            Android-App erhebt keine solche Statistik.
          </p>
        </Section>

        <Section title="Dienstleister">
          <ul className="list-disc space-y-2 pl-5">
            <li>
              <strong className="text-slate-200">Supabase</strong> (Supabase Inc.)
              speichert die Bestenliste und die Spielstatistik in einer Datenbank.
            </li>
            <li>
              <strong className="text-slate-200">Vercel</strong> (Vercel Inc.)
              hostet die Webversion. Beim Aufruf verarbeitet Vercel technisch
              notwendige Daten wie die IP-Adresse in Server-Logs.
            </li>
            <li>
              <strong className="text-slate-200">Google Play</strong> vertreibt die
              App. Für Download und Updates gilt die Datenschutzerklärung von
              Google.
            </li>
          </ul>
          <p>
            Soweit Daten dabei in die USA übertragen werden, erfolgt dies auf
            Grundlage von EU-Standardvertragsklauseln bzw. des EU-US Data Privacy
            Framework.
          </p>
        </Section>

        <Section title="Deine Rechte">
          <p>
            Du hast das Recht auf Auskunft, Berichtigung, Löschung, Einschränkung
            der Verarbeitung, Datenübertragbarkeit sowie Widerspruch und kannst
            eine erteilte Einwilligung jederzeit widerrufen. Schreib dazu einfach
            eine E-Mail an{' '}
            <a className="text-cyan-400 underline" href="mailto:atec@gmx.at">
              atec@gmx.at
            </a>{' '}
            – für die Löschung eines Bestenlisten-Eintrags genügen Name und
            ungefährer Zeitpunkt.
          </p>
          <p>
            Außerdem kannst du dich bei der österreichischen Datenschutzbehörde
            (dsb.gv.at) beschweren.
          </p>
        </Section>

        <Section title="Kinder">
          <p>
            Swing richtet sich nicht gezielt an Kinder unter 14 Jahren und erhebt
            wissentlich keine Daten von ihnen.
          </p>
        </Section>
      </article>
    </main>
  )
}
