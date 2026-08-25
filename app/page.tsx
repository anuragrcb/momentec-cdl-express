import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

export default function HomePage() {
  return (
    <>
      <header className="site-header">
        <div className="wrap inner">
          <Wordmark />
          <span className="tagline">Outfitting moments that matter</span>
        </div>
      </header>

      <section className="hero">
        <div className="wrap">
          <div className="hero-kicker">AI Design → Real Jersey, Fast</div>
          <h1>Your AI design. Matched, previewed, submitted — in minutes.</h1>
          <p className="lead">
            Already have a design from Midjourney, ChatGPT, or your own artist? Upload it, we&apos;ll
            identify the sport, garment and colors, match it to a real Momentec / Augusta style, and
            show you a 3D preview before it ever reaches an artist.
          </p>
          <div className="cta-row">
            <Link href="/design?mode=submit" className="btn btn-primary">
              Submit My AI Design
            </Link>
            <Link href="/design?mode=start" className="btn btn-secondary">
              Start My AI Design
            </Link>
          </div>

          <div className="entry-grid">
            <div className="entry-card">
              <span className="step-no">Primary flow</span>
              <h3>Submit My AI Design</h3>
              <p>
                You already have front (and maybe back/side) artwork. Upload it, confirm what our AI
                read off it, pick the closest real style, preview it in 3D where available, and send
                it to an artist for review.
              </p>
              <span className="badge">Built &amp; working</span>
            </div>
            <div className="entry-card">
              <span className="step-no">Coming soon</span>
              <h3>Start My AI Design</h3>
              <p>
                Generate a brand-new concept from scratch with guided prompts, right inside CDL
                Express. This entry point is a placeholder for now — the primary use case below is
                what&apos;s actually built.
              </p>
              <span className="badge">Stub only</span>
            </div>
          </div>
        </div>
      </section>

      <section className="strip">
        <div className="wrap">
          <h2>How Submit My AI Design works</h2>
          <div className="steps">
            <div className="step">
              <div className="num">01</div>
              <h4>Upload</h4>
              <p>Front image required, back/left/right optional. Know your style number? Add it.</p>
            </div>
            <div className="step">
              <div className="num">02</div>
              <h4>Confirm the read</h4>
              <p>Our AI reads sport, garment type and colors off your art — you review and correct it.</p>
            </div>
            <div className="step">
              <div className="num">03</div>
              <h4>Match &amp; preview</h4>
              <p>Pick from real Momentec/Augusta styles. Four styles get a live 3D preview today.</p>
            </div>
            <div className="step">
              <div className="num">04</div>
              <h4>Submit for review</h4>
              <p>Add comments and send it — an artist picks it up from here.</p>
            </div>
          </div>

          <div className="honesty-note">
            <strong>Honest scope:</strong> this produces a design match, an editable AI read of your
            artwork, and a real-time 3D preview on the actual garment mesh where one exists. It does
            not produce production-ready cut-piece files, and only 4 of our 364 catalogue styles
            currently have a working 3D preview — every other style can still be identified and
            matched by name, and your design is recorded either way.
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="wrap">Momentec Brands — CDL Express (internal prototype, not production COMS)</div>
      </footer>
    </>
  );
}
