import { useState } from "react";
import { useLiveData } from "../../ui/arena-data";
import { duration, type Boards } from "./api";
import "./detective.css";
import { LocalizedContent } from "../../ui/i18n";
export default function DetectiveLeaderboard() {
  const [selected, setSelected] = useState("");
  const { data, error } = useLiveData<Boards>(`/api/detective/leaderboard${selected ? `?board=${encodeURIComponent(selected)}` : ""}`);
  return <LocalizedContent><section className="dd-leaderboard"><p>Rankings are separate for solo/team, case version, difficulty, rules and event. Practice seeds vary only equivalent presentation details.</p><label>Competition board<select value={selected} onChange={e => setSelected(e.target.value)}><option value="">Select a comparable board…</option>{data?.boards.map(b => <option key={b.key} value={b.key}>{b.title} v{b.version} · {b.difficulty} · {b.mode} · {b.competitionId ?? "Practice"} · {b.key.slice(0,6)}</option>)}</select></label>{error && <p role="alert">Rankings unavailable. Reconnecting…</p>}{data?.visible === false ? <p>Rankings are hidden by the organizer.</p> : !selected ? <p>{data?.boards.length ? "Choose a board above." : "No completed investigations yet."}</p> : <><div className="dd-rank-row"><span>#</span><strong>INVESTIGATOR</strong><span>SCORE</span><span>ACCURACY</span><span>TIME</span></div>{data?.entries.map(e => <div className="dd-rank-row" key={e.id}><span>{e.rank}</span><strong>{e.challenger}</strong><b>{e.score}</b><span>{e.accuracy}%</span><span>{duration(e.elapsed)}</span></div>)}{!data?.entries.length && <p>No results in this board.</p>}</>}<p className="dd-caption">Score → accuracy → fastest valid completion → earliest verified submission.</p></section></LocalizedContent>;
}
