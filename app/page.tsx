import Image from "next/image";
import Link from "next/link";
import { Wordmark } from "@/components/Wordmark";

const PROCESS = [
  { number: "1", time: "~1 min", title: "Upload your design", copy: "Add the front, back and side references you have. The original artwork remains attached to the job." },
  { number: "2", time: "AI mapped", title: "Review every mark", copy: "Confirm the detected logos, colors, names, numbers, patterns and their exact garment placements." },
  { number: "3", time: "Real catalog", title: "Choose the garment", copy: "Match the design to the real Momentec and Augusta catalog instead of an invented AI garment." },
  { number: "4", time: "Interactive", title: "Approve the 3D proof", copy: "Inspect the selected size from the front, back and both sides on the manufacturer model." },
  { number: "5", time: "Artist ready", title: "Handoff the package", copy: "Review extracted source assets and editable SVG references, then submit one organized package to the artist." },
];

export default function HomePage() {
  return (
    <div className="marketing-page">
      <header className="marketing-header">
        <div className="marketing-header-inner">
          <Wordmark official />
          <nav aria-label="Main navigation">
            <a href="#how">How It Works</a>
            <Link href="/design?mode=submit">AI Studio</Link>
            <a href="mailto:aicreator@momentecbrands.com">Contact</a>
          </nav>
          <Link className="btn marketing-header-cta" href="/design?mode=submit">Submit My Design</Link>
        </div>
      </header>

      <main>
        <section className="marketing-hero">
          <div className="marketing-hero-inner">
            <div className="marketing-hero-copy">
              <Image className="marketing-ai-logo" src="/momentec-ai-studio.png" alt="Momentec AI Studio" width={720} height={279} priority />
              <p className="marketing-kicker">AI concept to manufacturer-matched proof</p>
              <h1>Your AI design.<br /><span>Mapped precisely.</span><br />Artist-ready.</h1>
              <p className="marketing-lead">Upload the design you already have. Momentec AI Studio maps every visible mark, matches a real garment, builds a size-specific 3D proof and prepares one reviewable artwork package.</p>
              <div className="marketing-actions">
                <Link href="/design?mode=submit" className="btn btn-primary">Submit My AI Design</Link>
                <a href="#how" className="btn btn-secondary">See How It Works</a>
              </div>
            </div>

            <div className="marketing-proof-story" aria-label="From AI concept to finished garment">
              <article className="marketing-proof-card concept-card">
                <div className="marketing-proof-image">
                  <Image src="/momentec-ai-concept.jpg" alt="AI-generated soccer jersey concept, front and back" fill sizes="(max-width: 900px) 80vw, 360px" priority />
                </div>
                <div><span>01</span><strong>AI-generated concept</strong></div>
              </article>
              <span className="marketing-story-arrow" aria-hidden="true">→</span>
              <article className="marketing-proof-card athlete-card">
                <div className="marketing-proof-image">
                  <Image src="/momentec-finished-athlete.jpg" alt="Athlete wearing the finished sublimated jersey" fill sizes="(max-width: 900px) 60vw, 280px" priority />
                </div>
                <div><span>02</span><strong>Finished M-Sublimation</strong></div>
              </article>
            </div>
          </div>
        </section>

        <div className="grad-rule" />

        <section className="marketing-launch-band">
          <div>
            <span>Built for teams, dealers and artists</span>
            <h2>Bring the design you have.<br />Leave with a complete handoff.</h2>
          </div>
          <Link href="/design?mode=submit" className="btn btn-secondary">Open AI Studio <span aria-hidden="true">↗</span></Link>
        </section>

        <section className="marketing-process" id="how">
          <div className="marketing-section-copy">
            <p className="marketing-kicker">The process</p>
            <h2>From reference image to one organized package.</h2>
            <p>No disconnected tools and no mystery handoff. The source views, garment choice, 3D approval and extracted artwork stay connected as one design record.</p>
          </div>
          <div className="marketing-process-grid">
            {PROCESS.map((item) => (
              <article key={item.number}>
                <div className="marketing-process-meta"><span>{item.number}</span><b>{item.time}</b></div>
                <h3>{item.title}</h3>
                <p>{item.copy}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="marketing-feature">
          <div className="marketing-feature-copy">
            <p className="marketing-kicker">One source of truth</p>
            <h2>Every view. Every mark. Every deliverable.</h2>
            <p>The artist sees the same approved proof the customer reviewed, plus the original crops, mapped placements, production comments and Illustrator reference package.</p>
            <ul>
              <li>Per-view logo, name, number and pattern extraction</li>
              <li>Manufacturer style and size coupling</li>
              <li>Four editable SVG reference sheets when Magnific is enabled</li>
            </ul>
          </div>
          <div className="marketing-feature-visual" aria-hidden="true">
            <div className="feature-orbit orbit-one" />
            <div className="feature-orbit orbit-two" />
            <div className="feature-core"><span>AI</span><strong>ARTWORK<br />PACKAGE</strong></div>
            <span className="feature-chip chip-one">3D proof</span>
            <span className="feature-chip chip-two">Source assets</span>
            <span className="feature-chip chip-three">SVG package</span>
          </div>
        </section>

        <section className="marketing-final-cta">
          <div>
            <p className="marketing-kicker">Already have an AI design?</p>
            <h2>Turn it into a proof your production team can use.</h2>
            <p>Start with the images you already have. The studio keeps the visual intent while making every handoff decision visible.</p>
          </div>
          <Link href="/design?mode=submit" className="btn btn-secondary">Submit My AI Design</Link>
        </section>
      </main>

      <footer className="marketing-footer">
        <div>
          <Wordmark official />
          <nav aria-label="Footer navigation">
            <a href="#how">How It Works</a>
            <Link href="/design?mode=submit">AI Studio</Link>
            <a href="mailto:aicreator@momentecbrands.com">Contact</a>
          </nav>
          <span>© Momentec Brands Inc. All Rights Reserved</span>
        </div>
      </footer>
    </div>
  );
}
