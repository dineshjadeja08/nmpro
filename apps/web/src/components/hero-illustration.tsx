import { Check, Clock3, Fan, ShieldCheck, Sparkles } from "lucide-react";

export function HeroIllustration() {
  return <div className="hero-art" aria-label="Illustration of a comfortable home and service planning" role="img">
    <div className="hero-art-orbit"/><div className="hero-art-house"><div className="house-roof"/><div className="house-body"><div className="house-window"><Fan size={40} strokeWidth={1.2}/></div><div className="house-door"/></div></div>
    <div className="hero-art-note hero-art-note--top"><span className="note-icon"><Sparkles size={19}/></span><span><b>Home care, simplified</b><small>One clear path from issue to visit</small></span></div>
    <div className="hero-art-note hero-art-note--bottom"><span className="note-icon"><Clock3 size={20}/></span><span><b>Choose your time</b><small>Where appointments are configured</small></span><Check size={17}/></div>
    <div className="hero-art-stamp"><ShieldCheck size={17}/> Designed for clarity</div>
  </div>;
}
