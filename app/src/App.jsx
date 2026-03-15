import { useState, useEffect, useCallback, useMemo } from "react";

const PROMPT_DEVOPS = `Search the web for 3 recent DevOps news articles (Kubernetes, CI/CD, GitOps, Docker, OpenShift, Ansible).
Respond ONLY with a JSON array, starting with [ and ending with ]. No markdown, no explanation, no backticks.
Example: [{"title":"Example","summary":"One sentence.","source":"InfoQ","url":"https://example.com","language":"en","date":"2026-03-15","category":"devops"}]`;

const PROMPT_AIDEVOPS = `Search the web for 3 recent AI DevOps or MLOps news articles (AIOps, LLMOps, AI pipelines, MLOps platforms).
Respond ONLY with a JSON array, starting with [ and ending with ]. No markdown, no explanation, no backticks.
Example: [{"title":"Example","summary":"One sentence.","source":"VentureBeat","url":"https://example.com","language":"en","date":"2026-03-15","category":"aidevops"}]`;

const ANTHROPIC_API_URL = import.meta.env.VITE_ANTHROPIC_API_URL || "https://api.anthropic.com/v1/messages";

const TRUSTED = ["theregister","infoq","thenewstack","devops.com","cncf","redhat","openshift","atlassian","gitlab","github","hashicorp","docker","aws","azure","google","datadog","ansible","jenkins","techcrunch","venturebeat"];
const isTrusted = s => TRUSTED.some(t => (s||"").toLowerCase().includes(t));
const TABS = [{ id:"all", label:"All" }, { id:"devops", label:"DevOps" }, { id:"aidevops", label:"AI DevOps" }];
const PHASE = { idle:"idle", searching:"searching", found:"found", done:"done" };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const C = {
  bg:"#0f0f0f", surface:"#171717", surfaceHi:"#1f1f1f",
  border:"#2a2a2a", borderHi:"#3a3a3a",
  text:"#e8e4dc", textMuted:"#888", textDim:"#555",
  devops:"#c8a96e", aidevops:"#7eb8a4", accent:"#c8a96e",
};

async function fetchNews(prompt) {
  const DELAYS = [0, 5000, 10000, 20000];
  let lastError;
  for (let attempt = 0; attempt < DELAYS.length; attempt++) {
    if (DELAYS[attempt] > 0) await sleep(DELAYS[attempt]);
    const ctrl = new AbortController();
    const tid  = setTimeout(() => ctrl.abort(), 90000);
    let res;
    try {
      res = await fetch("/api/proxy/messages", {
        method: "POST", signal: ctrl.signal,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514", max_tokens: 3000,
          tools: [{ type: "web_search_20250305", name: "web_search" }],
          messages: [{ role: "user", content: prompt }],
        }),
      });
    } catch(e) {
      clearTimeout(tid);
      lastError = new Error(e.name === "AbortError" ? "TIMEOUT 90s" : `Fetch: ${e.message}`);
      continue;
    }
    clearTimeout(tid);
    if (res.status === 429) { lastError = new Error(`429 concurrents (intento ${attempt+1}/${DELAYS.length})`); continue; }
    if (!res.ok) { const b = await res.text(); throw new Error(`HTTP ${res.status}: ${b.slice(0,200)}`); }
    const data = await res.json();
    if (data.error) throw new Error(`API: ${JSON.stringify(data.error)}`);
    const stopReason   = data.stop_reason || "?";
    const outputTokens = data.usage?.output_tokens || 0;
    const text = (data.content||[]).filter(b=>b.type==="text").map(b=>b.text).join("");
    if (!text) throw new Error(`Sin texto. stop=${stopReason}, tokens=${outputTokens}`);
    const clean = text.replace(/```[\w]*/g,"").replace(/```/g,"").trim();
    const s = clean.indexOf("["), e = clean.lastIndexOf("]");
    if (s===-1||e===-1) throw new Error(`Sin JSON. stop=${stopReason}, tokens=${outputTokens}. "${clean.slice(0,150)}"`);
    let parsed;
    try { parsed = JSON.parse(clean.slice(s, e+1)); } catch(err) { throw new Error(`JSON inválido: ${err.message}`); }
    if (!Array.isArray(parsed)||parsed.length===0) throw new Error("Array vacío");
    return { items: parsed, stopReason, outputTokens };
  }
  throw lastError || new Error("Reintentos agotados");
}

function LoadingScreen({ devopsPhase, aiPhase, devopsCount, aiCount }) {
  const anyFound = devopsPhase===PHASE.found || aiPhase===PHASE.found;
  const now = new Date();
  const dateStr = now.toLocaleDateString("es-ES",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:32,padding:"4rem 1rem"}}>
      <div style={{textAlign:"center"}}>
        <div style={{fontSize:11,letterSpacing:"0.2em",color:C.textDim,textTransform:"uppercase",marginBottom:8}}>{dateStr}</div>
        <div style={{fontSize:anyFound?"64px":"52px",lineHeight:1,transition:"font-size 0.3s",
          animation:anyFound?"pop 0.4s both":"bob 1.8s ease-in-out infinite"}}>
          {anyFound?"👍":"🤔"}
        </div>
      </div>
      <div style={{width:"100%",maxWidth:420,display:"flex",flexDirection:"column",gap:1}}>
        {[
          {label:"DevOps",phase:devopsPhase,count:devopsCount,color:C.devops},
          {label:"AI DevOps",phase:aiPhase,count:aiCount,color:C.aidevops},
        ].map(({label,phase,count,color})=>(
          <div key={label} style={{display:"flex",alignItems:"center",gap:14,padding:"14px 0",borderBottom:`1px solid ${C.border}`}}>
            <div style={{width:6,height:6,borderRadius:"50%",
              background:phase===PHASE.found||phase===PHASE.done?color:phase===PHASE.searching?color:C.textDim,
              animation:phase===PHASE.searching?"blink 1s ease-in-out infinite":"none"}}/>
            <div style={{flex:1}}>
              <span style={{fontSize:13,color:C.text}}>{label}</span>
            </div>
            <div style={{fontSize:12,color:phase===PHASE.found||phase===PHASE.done?color:C.textMuted,
              animation:phase===PHASE.searching?"pulse 1.2s ease-in-out infinite":"none"}}>
              {phase===PHASE.searching?"Buscando...":phase===PHASE.found||phase===PHASE.done?`${count} artículos`:"En espera"}
            </div>
          </div>
        ))}
      </div>
      <p style={{fontSize:12,color:C.textDim,margin:0,letterSpacing:"0.05em",textAlign:"center"}}>
        {anyFound?"PRIMERA EDICIÓN LISTA · PREPARANDO MÁS":"CONSULTANDO FUENTES · PUEDE TARDAR HASTA 90s"}
      </p>
    </div>
  );
}

function NewsCard({item,featured}){
  const catColor=item.category==="devops"?C.devops:C.aidevops;
  const catLabel=item.category==="devops"?"DevOps":"AI DevOps";
  if(featured){
    return(
      <div style={{borderTop:`3px solid ${catColor}`,paddingTop:"1.25rem",paddingBottom:"1.5rem",borderBottom:`1px solid ${C.border}`}}>
        <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:10}}>
          <span style={{fontSize:10,letterSpacing:"0.15em",textTransform:"uppercase",color:catColor,fontWeight:500}}>{catLabel}</span>
          {isTrusted(item.source)&&<span style={{fontSize:10,letterSpacing:"0.1em",textTransform:"uppercase",color:C.textDim}}>· Fuente verificada</span>}
        </div>
        <a href={item.url} target="_blank" rel="noopener noreferrer"
          style={{display:"block",fontSize:24,lineHeight:1.3,color:C.text,textDecoration:"none",marginBottom:12,fontWeight:400}}>
          {item.title}
        </a>
        <p style={{fontSize:14,color:C.textMuted,margin:"0 0 12px",lineHeight:1.7}}>{item.summary}</p>
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <span style={{fontSize:11,color:C.textDim,letterSpacing:"0.05em"}}>{item.source} · {(item.language||"en").toUpperCase()} · {item.date}</span>
          <a href={item.url} target="_blank" rel="noopener noreferrer"
            style={{fontSize:11,color:catColor,textDecoration:"none",letterSpacing:"0.1em",textTransform:"uppercase"}}>Leer →</a>
        </div>
      </div>
    );
  }
  return(
    <div style={{paddingTop:"1rem",paddingBottom:"1rem",borderBottom:`1px solid ${C.border}`,display:"flex",flexDirection:"column",gap:6}}>
      <div style={{display:"flex",alignItems:"center",gap:8}}>
        <span style={{fontSize:10,letterSpacing:"0.12em",textTransform:"uppercase",color:catColor}}>{catLabel}</span>
        <span style={{fontSize:10,color:C.textDim}}>· {item.source} · {item.date}</span>
      </div>
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        style={{fontSize:16,lineHeight:1.4,color:C.text,textDecoration:"none",fontWeight:400}}>
        {item.title}
      </a>
      <p style={{fontSize:12,color:C.textMuted,margin:0,lineHeight:1.6}}>{item.summary}</p>
      <a href={item.url} target="_blank" rel="noopener noreferrer"
        style={{fontSize:11,color:catColor,textDecoration:"none",letterSpacing:"0.08em",textTransform:"uppercase",alignSelf:"flex-start"}}>Leer →</a>
    </div>
  );
}

export default function App() {
  const [news,setNews]=useState([]);
  const [tab,setTab]=useState("all");
  const [search,setSearch]=useState("");
  const [lastUpdated,setLastUpdated]=useState(null);
  const [error,setError]=useState(null);
  const [devopsPhase,setDevopsPhase]=useState(PHASE.idle);
  const [aiPhase,setAiPhase]=useState(PHASE.idle);
  const [devopsCount,setDevopsCount]=useState(0);
  const [aiCount,setAiCount]=useState(0);

  const isLoading=[devopsPhase,aiPhase].some(p=>p===PHASE.searching||p===PHASE.found);

  const load=useCallback(async()=>{
    setNews([]);setError(null);setSearch("");
    setDevopsPhase(PHASE.searching);setAiPhase(PHASE.idle);
    setDevopsCount(0);setAiCount(0);
    let di=[],ai=[];
    try{
      const{items}=await fetchNews(PROMPT_DEVOPS);
      di=items;setDevopsCount(items.length);setDevopsPhase(PHASE.found);
      setTimeout(()=>setDevopsPhase(PHASE.done),600);
    }catch(e){setDevopsPhase(PHASE.done);setError(prev=>(prev?prev+" | ":"")+`DevOps: ${e.message}`);}
    setAiPhase(PHASE.searching);
    try{
      const{items}=await fetchNews(PROMPT_AIDEVOPS);
      ai=items;setAiCount(items.length);setAiPhase(PHASE.found);
      setTimeout(()=>setAiPhase(PHASE.done),600);
    }catch(e){setAiPhase(PHASE.done);setError(prev=>(prev?prev+" | ":"")+`AI DevOps: ${e.message}`);}
    const all=[...di,...ai];
    setNews(all);
    if(all.length>0)setLastUpdated(new Date().toLocaleTimeString("es-ES",{hour:"2-digit",minute:"2-digit"}));
  },[]);

  useEffect(()=>{load();},[load]);

  const filtered=useMemo(()=>{
    let items=tab==="all"?news:news.filter(n=>n.category===tab);
    if(search.trim()){const q=search.toLowerCase();items=items.filter(n=>n.title?.toLowerCase().includes(q)||n.source?.toLowerCase().includes(q)||n.summary?.toLowerCase().includes(q));}
    return items;
  },[news,tab,search]);

  const counts={all:news.length,devops:news.filter(n=>n.category==="devops").length,aidevops:news.filter(n=>n.category==="aidevops").length};
  const showLoading=isLoading&&news.length===0;
  const edition=new Date().toLocaleDateString("es-ES",{weekday:"long",year:"numeric",month:"long",day:"numeric"});
  const featured=filtered[0];
  const rest=filtered.slice(1);

  return(
    <div style={{minHeight:"100vh",background:C.bg,color:C.text,fontFamily:"Georgia, serif"}}>
      <style>{`
        @keyframes fadein{from{opacity:0;transform:translateY(6px)}to{opacity:1;transform:translateY(0)}}
        @keyframes bob{0%,100%{transform:translateY(0)}50%{transform:translateY(-8px)}}
        @keyframes pop{0%{transform:scale(0.5);opacity:0}70%{transform:scale(1.15)}100%{transform:scale(1);opacity:1}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.3}}
        @keyframes blink{0%,100%{opacity:1}50%{opacity:0.2}}
        a:hover{opacity:0.75;}
      `}</style>

      <header style={{borderBottom:`1px solid ${C.borderHi}`,background:C.bg}}>
        <div style={{maxWidth:900,margin:"0 auto",padding:"0 1.5rem"}}>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 0",borderBottom:`1px solid ${C.border}`,fontSize:11,color:C.textDim,letterSpacing:"0.08em"}}>
            <span style={{textTransform:"uppercase"}}>{edition}</span>
            <div style={{display:"flex",gap:16,alignItems:"center"}}>
              {lastUpdated&&<span>Actualizado {lastUpdated}</span>}
              <button onClick={load} disabled={isLoading}
                style={{fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",color:isLoading?C.textDim:C.accent,background:"none",border:"none",cursor:isLoading?"not-allowed":"pointer",padding:0}}>
                {isLoading?"Cargando...":"↻ Actualizar"}
              </button>
            </div>
          </div>
          <div style={{textAlign:"center",padding:"1.5rem 0 1rem"}}>
            <div style={{fontSize:42,letterSpacing:"-0.01em",color:C.text,lineHeight:1,marginBottom:6}}>DevOps Daily</div>
            <div style={{fontSize:11,letterSpacing:"0.25em",color:C.textDim,textTransform:"uppercase"}}>Infrastructure · Automation · AI Operations</div>
          </div>
          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",borderTop:`1px solid ${C.border}`,padding:"10px 0",gap:12,flexWrap:"wrap"}}>
            <div style={{display:"flex",gap:0}}>
              {TABS.map((t,i)=>(
                <button key={t.id} onClick={()=>setTab(t.id)}
                  style={{fontSize:12,letterSpacing:"0.1em",textTransform:"uppercase",padding:"4px 14px",background:"none",border:"none",cursor:"pointer",
                    color:tab===t.id?C.accent:C.textMuted,borderRight:i<TABS.length-1?`1px solid ${C.border}`:"none",fontWeight:tab===t.id?500:400}}>
                  {t.label} <span style={{fontSize:10,color:C.textDim}}>({counts[t.id]})</span>
                </button>
              ))}
            </div>
            <div style={{position:"relative",display:"flex",alignItems:"center"}}>
              <span style={{position:"absolute",left:0,fontSize:12,color:C.textDim,pointerEvents:"none"}}>🔍</span>
              <input type="text" placeholder="Buscar artículos..." value={search} onChange={ev=>setSearch(ev.target.value)}
                style={{background:"none",border:"none",borderBottom:`1px solid ${C.border}`,fontSize:12,color:C.text,paddingLeft:20,paddingBottom:3,width:200,outline:"none"}}/>
              {search&&<button onClick={()=>setSearch("")} style={{position:"absolute",right:0,fontSize:12,color:C.textDim,background:"none",border:"none",cursor:"pointer"}}>✕</button>}
            </div>
          </div>
        </div>
      </header>

      <main style={{maxWidth:900,margin:"0 auto",padding:"1.5rem"}}>
        {showLoading&&<LoadingScreen devopsPhase={devopsPhase} aiPhase={aiPhase} devopsCount={devopsCount} aiCount={aiCount}/>}
        {error&&!isLoading&&(
          <div style={{padding:"1rem",borderLeft:`3px solid #c0392b`,marginBottom:"1.5rem",background:"#1a1010",fontSize:12,color:"#e74c3c",lineHeight:1.6}}>
            <strong>Error:</strong> {error}
          </div>
        )}
        {!showLoading&&filtered.length>0&&(
          <div style={{animation:"fadein 0.4s ease"}}>
            {featured&&<NewsCard item={featured} featured={true}/>}
            {rest.length>0&&(
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(280px,1fr))",gap:"0 2rem",marginTop:4}}>
                {rest.map((item,i)=><NewsCard key={i} item={item}/>)}
              </div>
            )}
          </div>
        )}
        {!showLoading&&news.length>0&&filtered.length===0&&(
          <div style={{textAlign:"center",padding:"3rem 0",borderTop:`1px solid ${C.border}`}}>
            <p style={{fontSize:18,color:C.textMuted,margin:"0 0 12px"}}>Sin resultados para "{search}"</p>
            <button onClick={()=>setSearch("")} style={{fontSize:11,letterSpacing:"0.1em",textTransform:"uppercase",color:C.accent,background:"none",border:"none",cursor:"pointer"}}>Limpiar búsqueda</button>
          </div>
        )}
      </main>

      {!showLoading&&(
        <footer style={{borderTop:`1px solid ${C.border}`,padding:"1rem 1.5rem",maxWidth:900,margin:"0 auto",display:"flex",justifyContent:"space-between",fontSize:10,color:C.textDim,letterSpacing:"0.08em",textTransform:"uppercase"}}>
          <span>DevOps Daily · Powered by Claude + Web Search</span>
          <span>{counts.all} artículos · {counts.devops} DevOps · {counts.aidevops} AI DevOps</span>
        </footer>
      )}
    </div>
  );
}