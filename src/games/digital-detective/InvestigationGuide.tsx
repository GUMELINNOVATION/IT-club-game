import { useState } from "react";
import { BookOpen, Lightbulb } from "lucide-react";
import { LocalizedContent } from "../../ui/i18n";

export default function InvestigationGuide({ active, hintPenalty }: { active: boolean; hintPenalty?: number }) {
  const [open, setOpen] = useState(false);
  return <LocalizedContent><section className="dd-guide dd-panel" aria-label="Investigation help">
    <button className="outline-button" aria-expanded={open} aria-controls="detective-guide-content" onClick={() => setOpen(!open)}><BookOpen size={17} /> {open ? "CLOSE GUIDE" : "HOW TO PLAY · FREE GUIDE"}</button>
    {open && <div id="detective-guide-content">
      <h2>Your investigator's field guide</h2>
      <p>Guides explain the tools for free. Case hints reveal investigation leads and can cost points.{active ? " Opening help does not pause the official countdown." : " Read this before Begin Investigation; the clock has not started yet."}</p>
      <ol className="dd-guide-steps">
        <li><strong>Read the mission.</strong> Identify what is known, what is only suspected, and what the objectives ask you to prove. A device owner is not necessarily the person using it.</li>
        <li><strong>Inspect source records.</strong> Search an account, IP, file name or session reference. Open a record for its full details. Filter by category and sort by timestamp; compare related records side by side.</li>
        <li><strong>Keep useful clues.</strong> Bookmark saves a record to your filtered shortlist. Flag marks suspicion, not proof. The + button puts evidence on your board. All three can be toggled off.</li>
        <li><strong>Connect the evidence.</strong> On Board, add hypotheses or notes. Choose From and To items, then Connect. Label interpretations as hypotheses, unverified or player-supported. Remove a link if new evidence contradicts it.</li>
        <li><strong>Reconstruct time.</strong> On Timeline, drag event cards or use Move Up/Down. Normalize local times to UTC. Use records to determine order rather than the shuffled presentation.</li>
        <li><strong>Explain each finding.</strong> On Report, choose the incident, entry, account/asset, root cause and containment. Expand supporting evidence and cite only relevant records. Explain how their references and timestamps support the conclusion; 20 characters is the minimum, not a substitute for reasoning.</li>
        <li><strong>Submit and hand over.</strong> Check your timeline and saved status, then submit one final report. Finish & Next Visitor clears this device for the next group while retaining official results.</li>
      </ol>
      <details><summary>Evidence vocabulary</summary><dl className="dd-guide-glossary"><dt>Account / session</dt><dd>An account identifies an identity; a session reference links activity within an authenticated session. Neither alone proves a person's physical involvement.</dd><dt>Source / destination IP</dt><dd>Where a connection starts and ends. An external connection alone does not establish theft; corroborate object, volume and delivery status.</dd><dt>Hash / metadata</dt><dd>A fingerprint can link file copies. Owner, creation and modification fields provide context; they do not automatically identify the actor.</dd><dt>Alert / approval</dt><dd>An alert is a lead to verify. Match original events against authorized changes before declaring an incident.</dd><dt>Containment</dt><dd>Stop further harm while preserving evidence: revoke relevant access, isolate affected assets where appropriate, and retain records.</dd></dl></details>
      <details><summary>Worked example · unrelated training scenario</summary><p>A login and file read share session TRAIN-7. A transfer mentions a different object and an approved change ticket. Link the login to the read, but do not claim the file was stolen just because traffic occurred afterward. A useful finding explains exactly which shared identifier establishes the relationship and what remains unproven.</p></details>
      <details><summary>Scoring, saving and team tips</summary><p>Base points: incident 150, entry 150, account/asset 150, timeline 200, evidence 200, containment 100, completeness 50. Up to 200 speed points require 70% accuracy. Relevant citations and written reasoning are required for conclusion credit; selecting everything reduces credit.</p><p>Use shared notes as your scratchpad. Watch for Workspace saved; refresh restores progress. The server clock continues during disconnections. At timeout the last server-saved report draft is scored.</p><p>Teams share one screen and one report. Discuss alternative explanations; one member can drive while others verify the timeline and evidence. No teammate accounts or other devices are needed.</p></details>
      <p className="dd-hint"><Lightbulb size={16} /> Case hints are separate from this free guide{hintPenalty === undefined ? "." : ` and cost ${hintPenalty} points each. You can reread unlocked hints for free.`}</p>
    </div>}
  </section></LocalizedContent>;
}
