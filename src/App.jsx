import { useState, useEffect, useCallback, useRef } from "react";

// ── Theme ─────────────────────────────────────────────────────────────────────
const BG="#16181c", S1="#1e2128", S2="#252830";
const BDR="rgba(255,255,255,0.07)", BDR2="rgba(255,255,255,0.13)";
const TXT="#e8eaf0", TXT2="#9098a8", TXT3="#5a6275";

// ── Coverage data ─────────────────────────────────────────────────────────────
const US_PORTFOLIO=["AAPL","MSFT","NVDA","GOOGL","AMZN","META","TSLA","AVGO","ORCL","CRM","SNPS","NOW"];
const HK_PORTFOLIO=["700.HK","9988.HK","1810.HK","3690.HK","9618.HK","2318.HK","1024.HK","9999.HK","268.HK","2382.HK"];
const US_WATCHLIST=["ADBE","WDAY","PANW","ZS","CRWD","SNOW","DDOG","MDB","GTLB","NET","HUBS","BILL","COIN","UBER","LYFT","ABNB","DASH","PLTR","UNH","TTD","ANET","CDNS","NFLX","DIS"];
const ALL_TICKERS=[
  ...US_PORTFOLIO.map(t=>({ticker:t,list:"Portfolio",region:"US"})),
  ...HK_PORTFOLIO.map(t=>({ticker:t,list:"Portfolio",region:"HK"})),
  ...US_WATCHLIST.map(t=>({ticker:t,list:"Watchlist",region:"US"})),
];
const STORAGE_KEY="coverage_monitor_v3";
const TODO_KEY="research_suite_todos_v1";
const FLOW_KEY="research_suite_flow_v1";
const STATUS_OPTIONS=["Not started","In progress","Covered","Stale"];
const SEED={
  SNPS:{researchDate:"2026-02-15",notes:"",status:"Covered",analyst:"Jenson",earnings:true},
  CDNS:{researchDate:"2026-02-12",notes:"",status:"Covered",analyst:"Jenson",earnings:true},
  NFLX:{researchDate:"2026-02-12",notes:"",status:"Covered",analyst:"Jenson",earnings:true},
  UNH:{researchDate:"2026-02-12",notes:"",status:"Covered",analyst:"Jenson",earnings:true},
  CRM:{researchDate:"2026-02-12",notes:"",status:"Covered",analyst:"Jenson",earnings:false},
  DIS:{researchDate:"2026-02-12",notes:"",status:"Covered",analyst:"Jenson",earnings:true},
  NOW:{researchDate:"2026-02-12",notes:"",status:"Covered",analyst:"Jenson",earnings:true},
  WDAY:{researchDate:"2026-02-12",notes:"",status:"Covered",analyst:"Jenson",earnings:false},
  MDB:{researchDate:"",notes:"",status:"Not started",analyst:"Jenson",earnings:false},
  DDOG:{researchDate:"",notes:"",status:"Not started",analyst:"Jenson",earnings:false},
  CRWD:{researchDate:"",notes:"",status:"Not started",analyst:"Jenson",earnings:false},
};
const initRow=()=>({researchDate:"",notes:"",status:"Not started",analyst:"",earnings:false});
const daysSince=d=>d?Math.floor((Date.now()-new Date(d))/86400000):null;
const fStyle=days=>{
  if(days===null)return{bg:"rgba(255,255,255,0.04)",text:TXT3,label:"—"};
  if(days<=7)return{bg:"rgba(99,153,34,0.18)",text:"#a3d060",label:`${days}d`};
  if(days<=30)return{bg:"rgba(186,117,23,0.18)",text:"#f0b84a",label:`${days}d`};
  if(days<=90)return{bg:"rgba(216,90,48,0.18)",text:"#f08060",label:`${days}d`};
  return{bg:"rgba(226,75,74,0.18)",text:"#f07070",label:`${days}d`};
};
const sStyle=s=>{
  if(s==="Covered")return{bg:"rgba(99,153,34,0.18)",text:"#a3d060"};
  if(s==="In progress")return{bg:"rgba(55,138,221,0.18)",text:"#72b3f5"};
  if(s==="Stale")return{bg:"rgba(186,117,23,0.18)",text:"#f0b84a"};
  return{bg:"rgba(255,255,255,0.05)",text:TXT2};
};

// ── Shared UI ─────────────────────────────────────────────────────────────────
const Pill=({bg,text,label})=>(
  <span style={{background:bg,color:text,borderRadius:4,padding:"2px 7px",fontSize:11,fontWeight:500,whiteSpace:"nowrap"}}>{label}</span>
);
const Btn=({onClick,children,disabled,style:s={}})=>(
  <button onClick={onClick} disabled={disabled}
    style={{background:"transparent",border:`0.5px solid ${BDR2}`,borderRadius:6,padding:"4px 12px",cursor:disabled?"not-allowed":"pointer",fontSize:12,color:disabled?TXT3:TXT,opacity:disabled?0.5:1,...s}}
    onMouseEnter={e=>{if(!disabled)e.target.style.background=S2}}
    onMouseLeave={e=>{e.target.style.background="transparent"}}>{children}</button>
);
const ExportBanner=({onExport,label})=>(
  <div style={{display:"flex",alignItems:"center",gap:10,background:"rgba(186,117,23,0.12)",border:`0.5px solid rgba(186,117,23,0.35)`,borderRadius:7,padding:"7px 12px",marginBottom:12}}>
    <span style={{fontSize:11,color:"#f0b84a",flex:1}}>⚠ {label} changed — export CSV to sync across devices.</span>
    <button onClick={onExport} style={{fontSize:11,padding:"3px 12px",borderRadius:5,border:`0.5px solid rgba(240,184,74,0.4)`,background:"rgba(240,184,74,0.1)",color:"#f0b84a",cursor:"pointer"}}
      onMouseEnter={e=>e.target.style.background="rgba(240,184,74,0.2)"}
      onMouseLeave={e=>e.target.style.background="rgba(240,184,74,0.1)"}>Export CSV ↓</button>
  </div>
);
const triggerDownload=(csv,filename)=>{
  const blob=new Blob([csv],{type:"text/csv;charset=utf-8;"});
  const url=URL.createObjectURL(blob);
  const a=document.createElement("a");
  a.href=url; a.download=filename;
  document.body.appendChild(a); a.click();
  document.body.removeChild(a);
  setTimeout(()=>URL.revokeObjectURL(url),1000);
};

// ── CSV helpers ───────────────────────────────────────────────────────────────
const toCSV=data=>{
  const hdr=["Ticker","Region","List","Analyst","Research Date","Days Since","Status","Earnings","Notes"];
  const lines=ALL_TICKERS.map(({ticker,region,list})=>{
    const d=data[ticker]; const days=daysSince(d.researchDate);
    const note=(d.notes||"").replace(/"/g,'""');
    return[ticker,region,list,d.analyst||"",d.researchDate||"",days===null?"":days,d.status,d.earnings?"Yes":"No",`"${note}"`].join(",");
  });
  return[hdr.join(","),...lines].join("\r\n");
};
const fromCSV=(text,existing)=>{
  const lines=text.trim().split(/\r?\n/); if(lines.length<2)return null;
  const nd={...existing};
  for(let i=1;i<lines.length;i++){
    const cols=lines[i].split(","); const ticker=cols[0]?.trim();
    if(!ticker||!nd[ticker])continue;
    nd[ticker]={analyst:cols[3]?.trim()||"",researchDate:cols[4]?.trim()||"",
      status:STATUS_OPTIONS.includes(cols[6]?.trim())?cols[6].trim():"Not started",
      earnings:cols[7]?.trim()==="Yes",notes:cols[8]?.replace(/^"|"$/g,"").replace(/""/g,'"').trim()||""};
  }
  return nd;
};
const toTodoCSV=items=>{
  const hdr=["Section","Label","Detail","Done"];
  const lines=items.map(i=>[`"${i.section}"`,`"${(i.label||"").replace(/"/g,'""')}"`,`"${(i.detail||"").replace(/"/g,'""')}"`,i.done?"Yes":"No"].join(","));
  return[hdr.join(","),...lines].join("\r\n");
};
const fromTodoCSV=(text,existing)=>{
  const lines=text.trim().split(/\r?\n/); if(lines.length<2)return null;
  const imported=[]; let maxId=existing.reduce((m,i)=>Math.max(m,i.id),0);
  for(let i=1;i<lines.length;i++){
    const cols=lines[i].match(/(".*?"|[^,]+|(?<=,)(?=,)|^(?=,)|(?<=,)$)/g)||[];
    const clean=cols.map(c=>c.replace(/^"|"$/g,"").replace(/""/g,'"').trim());
    if(!clean[1])continue;
    imported.push({id:++maxId,section:clean[0]||"General",label:clean[1],detail:clean[2]||"",done:clean[3]==="Yes"});
  }
  return imported.length>0?imported:null;
};

// ── Static data ───────────────────────────────────────────────────────────────
const AI_TOOLS=[
  {name:"Chat",tagline:"One-off disposable tasks",useCases:["Morning Brief Draft","Fast templated outputs","Ad hoc questions","Schema changes via file tools"],notFor:["Earnings tracking","Financial model iteration","Anything needing persistence"],pros:["Single convo / fresh context window","Only Memory needed (if enabled)","Lowest overhead — speed + flexibility"],cons:["Stateless by default","Needs Past-chats search tool for history","Outside any project = no shared files","Memory is a supplement only — limited window, imprecise"],neutral:[],accent:"#378ADD"},
  {name:"Artifacts",tagline:"Chat + visual / productivity plane",useCases:["Integrated tracker (this tool)","Discrete deliverables","Investment memo presentation","EDGAR automation with live preview","Segment data or comps tables"],notFor:["Binary file export natively (xlsx, PDF, images)"],pros:["Self-contained content: web app, docs, graphics","Multi-content output","Editable by prompt","Visual / object output","Export: copy, download, add to project"],cons:["Binary formats not natively packaged — partially addressed by File Creation tools writing to disk"],neutral:["Output: html, jsx, md, svg, source scripts","Workflow: Describe then See then Refine then Describe"],accent:"#1D9E75"},
  {name:"Projects",tagline:"Persistent and collaborative workspace",useCases:["Coverage universe + filing history","Memos standing instruction","Per-ticker coverage work","Earnings model iteration","Initiation and deep dive"],notFor:["Ad hoc tasks","Execution engine tasks (use CoWork)"],pros:["Workspace: Files + Instructions + Memory + Chat History","Less prompting overhead","Collaboration-ready","200k large context","SQLite for persistent memory"],cons:["Context cost burns token budget fast","High setup overhead","Not for ad hoc","No autonomy"],neutral:["Tip: Export SQLite to CSV for initiation write-ups (~1000 rows x 90-char ~ 100k context)","Bridge: Prompt to SQLite to CSV (insight, evidence, implication)"],accent:"#7F77DD"},
  {name:"Context cost",tagline:"Token burn hierarchy",useCases:["Budget awareness when choosing a tool"],notFor:[],pros:[],cons:["10k code + 5 transcript turns burns most of 200k context per prompt","Burns every teammate on every shared project prompt"],neutral:[],accent:"#BA7517"},
  {name:"CoWork",tagline:"GUI-friendly autonomous agent",useCases:["Async queued work","Reading, drafting, reorganising, coding","Finished outputs with plug-in bridges","Task persistency until done"],notFor:["Destructive actions (file deletion)","Tasks requiring sleep/pause"],pros:["Agency — acts autonomously","Reads, drafts, reorganises, codes","Finished outputs","Plug-in bridges to external systems","Task persistency"],cons:["Destructive action risk","Cannot sleep / pause mid-task"],neutral:[],accent:"#1D9E75"},
  {name:"Claude Code",tagline:"Autonomous CLI agent — untamed execution",useCases:["Read repo and understand architecture","Write tests","Propose diffs","Run agent loops with precision"],notFor:["Consequential changes without review","Anyone without a solid Git workflow"],pros:["Reads full repository context","Writes tests","Proposes diffs","Runs agent loops"],cons:["Consequential changes — developer responsible","Requires disciplined diff review","Solid Git workflow mandatory"],neutral:[],accent:"#888780"},
];
const CONTEXT_COST=AI_TOOLS.find(t=>t.name==="Context cost");
const DISPLAY_TOOLS=AI_TOOLS.filter(t=>t.name!=="Context cost");
const USE_CASES=[
  {rank:1,name:"Initiation report first draft",tool:"Projects",how:"Query all rows for ticker, rank by weight, inject top 400 rows as grounding"},
  {rank:2,name:"Mon/Wed/Fri memo — portfolio delta",tool:"Artifact",how:"Query rows added in last 3 days, Claude surfaces what changed"},
  {rank:3,name:"Cross-ticker pattern detection",tool:"Artifact",how:"Query by implication or sector tag, ask Claude what themes are recurring"},
  {rank:4,name:"Thesis stress-testing",tool:"Projects",how:"Pull all rows tagged bearish, Claude constructs bear case from accumulated evidence"},
  {rank:5,name:"Earnings preview grounding",tool:"Projects",how:"2 days before earnings, query historical rows for ticker + sector comps"},
  {rank:6,name:"Industry / thematic research",tool:"Projects",how:"Query by sector tag across all tickers, produces industry note"},
  {rank:7,name:"Source conflict detection",tool:"CoWork",how:"Query same ticker/window, ask Claude to identify sell-side vs own observation conflicts"},
  {rank:8,name:"Weight decay / staleness audit",tool:"CoWork",how:"Query rows older than 90 days with high weight, Claude flags stale beliefs"},
  {rank:9,name:"Segment visualisation / comp table",tool:"Artifact",how:"React/HTML interactive table or chart"},
  {rank:10,name:"Model maintenance post update",tool:"Projects",how:"Ground with EDGAR data, preserve context across sessions"},
  {rank:11,name:"Investment committee presentation",tool:"Projects",how:"Query top-weighted rows, Claude builds narrative spine"},
  {rank:12,name:"Morning brief automation ★",tool:"CoWork",how:"Nightly cron: EDGAR + news, auto-INSERT, morning query formats brief"},
  {rank:13,name:"Batch-process 100 EDGAR filings overnight",tool:"CoWork",how:""},
  {rank:14,name:"Bridge from chat to SQLite.db",tool:"CoWork",how:""},
  {rank:15,name:"Build / maintain SEC EDGAR ingestion pipeline",tool:"CoWork",how:""},
  {rank:16,name:"Research facts schema design",tool:"Chat",how:""},
  {rank:17,name:"SEC EDGAR automation / ingestion preview",tool:"Artifact",how:"Code, live-preview inside a Project"},
];
const TOOL_COLORS={Projects:{bg:"rgba(127,119,221,0.15)",text:"#a89fef"},Artifact:{bg:"rgba(29,158,117,0.15)",text:"#4ecfa0"},CoWork:{bg:"rgba(55,138,221,0.15)",text:"#72b3f5"},Chat:{bg:"rgba(186,117,23,0.15)",text:"#f0b84a"}};
const INIT_COMPS=[
  {name:"OpenAI",notion:false,gdrive:true,sharepoint:"SharePoint",cowork:"Operator (Cloud) OpenClaw TBA"},
  {name:"Gemini",notion:true,gdrive:false,sharepoint:"SharePoint",cowork:"Mariner (Cloud, Personal)"},
  {name:"Claude",notion:true,gdrive:true,sharepoint:"",cowork:"CoWork (Desktop)"},
];
const INIT_ALTS=[
  {alt:"AgentZero",cowork:"OpenWork",personal:"OpenClaw"},
  {alt:"LangGraph",cowork:"Eigent.ai",personal:"NanoClaw"},
  {alt:"MyGPT (Single Task)",cowork:"",personal:""},
];
let _todoId=3;
const INIT_TODOS=[
  {id:1,section:"Automation workflow",label:"SQLite to Claude (read, for report writing)",detail:"Query SQLite (ranked/filtered), extract 3 cols, format as CSV, upload to Project or paste into chat",done:false},
  {id:2,section:"Automation workflow",label:"Claude to SQLite (write, capturing new insight)",detail:"Chat session generates new insight, prompt Claude to output structured JSON matching research_facts schema, Python script parses JSON, INSERT into SQLite.",done:false},
];

// ── Flow constants ────────────────────────────────────────────────────────────
const NODE_W=140, NODE_H=36;
const NODE_COLORS=["#378ADD","#1D9E75","#7F77DD","#BA7517","#f07070","#a3d060","#9098a8"];
const TABLE_COL_W=72, TABLE_ROW_H=22, TABLE_HEADER_H=26;
const makeTable=()=>({cols:["Col A","Col B","Col C"],rows:[["","",""],["","",""],["","",""]]});
const INIT_FLOW_NODES=[
  {id:"n1",x:80,y:60,w:NODE_W,h:NODE_H,label:"Start",shape:"rounded",color:"#1D9E75"},
  {id:"n2",x:80,y:160,w:NODE_W,h:NODE_H,label:"Process",shape:"rect",color:"#378ADD"},
  {id:"n3",x:80,y:260,w:NODE_W,h:NODE_H,label:"End",shape:"rounded",color:"#f07070"},
];
const INIT_FLOW_EDGES=[{id:"e1",from:"n1",to:"n2"},{id:"e2",from:"n2",to:"n3"}];
const INIT_TABLE_DATA={cols:["Column A","Column B","Column C"],rows:[["","",""],["","",""],["","",""]]};

// ── AISect ────────────────────────────────────────────────────────────────────
function AISect({label,items,color}){
  return (
    <div style={{padding:"10px 13px",borderRight:`0.5px solid rgba(255,255,255,0.05)`}}>
      <div style={{fontSize:10,fontWeight:500,color:TXT3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>{label}</div>
      <ul style={{margin:0,padding:0,listStyle:"none",display:"flex",flexDirection:"column",gap:4}}>
        {items.map((item,i)=>(
          <li key={i} style={{fontSize:11,color,lineHeight:1.5,paddingLeft:10,position:"relative"}}>
            <span style={{position:"absolute",left:0,opacity:0.4}}>·</span>{item}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ── WorkflowChart ─────────────────────────────────────────────────────────────
function WorkflowChart(){
  const nodes=[
    {id:"ingest",x:220,y:10,w:200,h:28,label:"New data — EDGAR / News / Chat",col:"#1D9E75"},
    {id:"db",x:220,y:72,w:200,h:28,label:"SQLite · research_facts.db",col:"#378ADD"},
    {id:"query",x:220,y:134,w:200,h:28,label:"Query layer — filter + rank",col:"#7F77DD"},
    {id:"csv",x:220,y:196,w:200,h:28,label:"Top rows as CSV",col:"#7F77DD"},
    {id:"upload",x:220,y:258,w:200,h:28,label:"Upload to Project / paste to chat",col:"#7F77DD"},
    {id:"claude",x:220,y:320,w:200,h:28,label:"Claude — grounded output",col:"#a89fef"},
    {id:"out",x:30,y:400,w:160,h:28,label:"Report / Memo / IC deck",col:"#1D9E75"},
    {id:"json",x:450,y:400,w:160,h:28,label:"New insight JSON",col:"#f0b84a"},
    {id:"py",x:450,y:470,w:160,h:28,label:"Python INSERT to SQLite",col:"#f0b84a"},
  ];
  const g=id=>nodes.find(n=>n.id===id);
  const cx=n=>n.x+n.w/2; const cy=n=>n.y+n.h/2; const bot=n=>n.y+n.h;
  return (
    <svg viewBox="0 0 660 530" width="100%" style={{display:"block"}}>
      <defs><marker id="wa" markerWidth="7" markerHeight="7" refX="6" refY="3" orient="auto"><path d="M0,0 L0,6 L7,3 z" fill="rgba(255,255,255,0.4)"/></marker></defs>
      {["ingest","db","query","csv","upload"].map((id,i,arr)=>{
        if(i===arr.length-1)return null;
        const a=g(id),b=g(arr[i+1]);
        return <line key={id} x1={cx(a)} y1={bot(a)} x2={cx(b)} y2={b.y-2} stroke="rgba(255,255,255,0.2)" strokeWidth="1" markerEnd="url(#wa)"/>;
      })}
      {(()=>{ const a=g("upload"),b=g("claude"); return <line x1={cx(a)} y1={bot(a)} x2={cx(b)} y2={b.y-2} stroke="rgba(255,255,255,0.2)" strokeWidth="1" markerEnd="url(#wa)"/>; })()}
      {(()=>{ const a=g("claude"),o=g("out"); return <polyline points={`${cx(a)},${bot(a)} ${cx(a)},${bot(a)+20} ${cx(o)},${bot(a)+20} ${cx(o)},${o.y}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" markerEnd="url(#wa)"/>; })()}
      {(()=>{ const a=g("claude"),j=g("json"); return <polyline points={`${cx(a)},${bot(a)} ${cx(a)},${bot(a)+20} ${cx(j)},${bot(a)+20} ${cx(j)},${j.y}`} fill="none" stroke="rgba(255,255,255,0.2)" strokeWidth="1" markerEnd="url(#wa)"/>; })()}
      {(()=>{ const j=g("json"),p=g("py"); return <line x1={cx(j)} y1={bot(j)} x2={cx(p)} y2={p.y-2} stroke="rgba(255,255,255,0.2)" strokeWidth="1" markerEnd="url(#wa)"/>; })()}
      {(()=>{ const p=g("py"),db=g("db"); const rx=p.x+p.w+30; return (<><polyline points={`${cx(p)},${bot(p)} ${cx(p)},${bot(p)+18} ${rx},${bot(p)+18} ${rx},${cy(db)} ${db.x+db.w+2},${cy(db)}`} fill="none" stroke="rgba(55,138,221,0.4)" strokeWidth="1" strokeDasharray="4,3" markerEnd="url(#wa)"/><text x={rx+5} y={(bot(p)+18+cy(db))/2} fontSize="9" fill="rgba(55,138,221,0.55)" textAnchor="start">feedback</text></>); })()}
      {nodes.map(n => (
        <g key={n.id}>
          <rect x={n.x} y={n.y} width={n.w} height={n.h} rx="5" fill={n.col+"22"} stroke={n.col+"99"} strokeWidth="0.75"/>
          <text x={cx(n)} y={n.y+n.h/2+4} textAnchor="middle" fontSize="10" fill={n.col}>{n.label}</text>
        </g>
      ))}
    </svg>
  );
}

// ── UseCasesPage ──────────────────────────────────────────────────────────────
function UseCasesPage(){
  const thS={padding:"7px 10px",fontSize:11,fontWeight:500,color:TXT3,textAlign:"left",borderBottom:`0.5px solid ${BDR2}`,whiteSpace:"nowrap"};
  const tdS={padding:"7px 10px",fontSize:12,color:TXT,borderBottom:`0.5px solid ${BDR}`,verticalAlign:"top"};
  return (
    <div>
      <div style={{fontSize:14,fontWeight:500,marginBottom:2}}>Use Cases</div>
      <div style={{fontSize:12,color:TXT2,marginBottom:16}}>Top use cases for RAG database — ranked by impact.</div>
      <div style={{overflowX:"auto",borderRadius:8,border:`0.5px solid ${BDR2}`,marginBottom:10}}>
        <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
          <colgroup><col style={{width:32}}/><col style={{width:"28%"}}/><col style={{width:78}}/><col style={{width:"auto"}}/></colgroup>
          <thead style={{background:S2}}><tr>{["#","Use case","Best tool","How RAG enables it"].map(h=><th key={h} style={thS}>{h}</th>)}</tr></thead>
          <tbody>
            {USE_CASES.map(row=>{
              const tc=TOOL_COLORS[row.tool]||{bg:"rgba(255,255,255,0.05)",text:TXT2};
              return (
                <tr key={row.rank} onMouseEnter={e=>e.currentTarget.style.background=S1} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                  <td style={{...tdS,color:TXT3,textAlign:"center",fontWeight:500}}>{row.rank}</td>
                  <td style={{...tdS,fontWeight:500}}>{row.name}</td>
                  <td style={tdS}><span style={{background:tc.bg,color:tc.text,borderRadius:4,padding:"2px 8px",fontSize:11,fontWeight:500,whiteSpace:"nowrap"}}>{row.tool}</span></td>
                  <td style={{...tdS,color:TXT2,lineHeight:1.6}}>{row.how||<span style={{color:TXT3}}>—</span>}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div style={{fontSize:11,color:"#f0b84a",marginBottom:24}}>★ Row 12 is necessary for full automation.</div>
      <div style={{fontSize:13,fontWeight:500,color:TXT,marginBottom:4}}>Key workflows</div>
      <div style={{fontSize:12,color:TXT2,marginBottom:12}}>End-to-end data flow — ingestion to grounded output and back to SQLite.</div>
      <div style={{background:S1,border:`0.5px solid ${BDR2}`,borderRadius:8,padding:"16px",overflowX:"auto"}}><WorkflowChart/></div>
    </div>
  );
}

// ── ToDoPage ──────────────────────────────────────────────────────────────────
function ToDoPage(){
  const [items,setItems]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [saveMsg,setSaveMsg]=useState("");
  const [pending,setPending]=useState(false);
  const [importErr,setImportErr]=useState("");
  const [newLabel,setNewLabel]=useState("");
  const [newDetail,setNewDetail]=useState("");
  const [newSection,setNewSection]=useState("Automation workflow");
  const [customSection,setCustomSection]=useState(false);
  const firstLoad=useRef(true);

  useEffect(()=>{
    (async()=>{
      try{
        const r=await window.localStorage.getItem(TODO_KEY);
        if(r){
          const p=JSON.parse(r);
          if(p.items){ setItems(p.items); _todoId=Math.max(...p.items.map(i=>i.id),_todoId)+1; }
          else setItems(INIT_TODOS);
        } else setItems(INIT_TODOS);
      } catch { setItems(INIT_TODOS); }
      setLoaded(true);
    })();
  },[]);

  const persist=async nd=>{
    try{ await window.localStorage.setItem(TODO_KEY,JSON.stringify({items:nd})); setSaveMsg("Saved"); setTimeout(()=>setSaveMsg(""),1500); }
    catch{ setSaveMsg("Save failed"); }
  };
  const apply=nd=>{ setItems(nd); persist(nd); if(!firstLoad.current)setPending(true); firstLoad.current=false; };
  const toggle=id=>apply(items.map(i=>i.id===id?{...i,done:!i.done}:i));
  const remove=id=>apply(items.filter(i=>i.id!==id));
  const add=()=>{
    if(!newLabel.trim())return;
    apply([...items,{id:_todoId++,section:newSection.trim()||"General",label:newLabel.trim(),detail:newDetail.trim(),done:false}]);
    setNewLabel(""); setNewDetail("");
  };
  const exportCSV=()=>{ if(!items)return; triggerDownload(toTodoCSV(items),`todos_${new Date().toISOString().slice(0,10)}.csv`); setPending(false); };
  const importCSV=e=>{
    const f=e.target.files?.[0]; if(!f)return;
    const r=new FileReader();
    r.onload=ev=>{ const imp=fromTodoCSV(ev.target.result,items||[]); if(!imp){setImportErr("Could not parse CSV.");return;} firstLoad.current=true; apply(imp); setImportErr(""); setSaveMsg("Imported"); setTimeout(()=>setSaveMsg(""),2000); };
    r.onerror=()=>setImportErr("File read error.");
    r.readAsText(f); e.target.value="";
  };

  if(!loaded||!items) return <div style={{color:TXT2,fontSize:12}}>Loading…</div>;
  const sections=[...new Set(items.map(i=>i.section))];
  const allSections=[...new Set([...sections,"Automation workflow","General"])];
  const inS={fontSize:12,padding:"6px 10px",borderRadius:5,border:`0.5px solid ${BDR2}`,background:S2,color:TXT,outline:"none",width:"100%",boxSizing:"border-box"};
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:2,flexWrap:"wrap"}}>
        <span style={{fontSize:14,fontWeight:500}}>To Do</span>
        <span style={{flex:1}}/>
        <Btn onClick={exportCSV}>Export CSV ↓</Btn>
        <label style={{fontSize:12,padding:"4px 12px",borderRadius:6,border:`0.5px solid ${BDR2}`,cursor:"pointer",color:TXT}}>
          Import CSV ↑<input type="file" accept=".csv" onChange={importCSV} style={{display:"none"}}/>
        </label>
        <span style={{fontSize:11,color:TXT3}}>{saveMsg}</span>
      </div>
      <div style={{fontSize:12,color:TXT2,marginBottom:12}}>Tracked tasks. Auto-saved to this device.</div>
      {importErr&&<div style={{fontSize:11,color:"#f07070",marginBottom:8}}>{importErr}</div>}
      {pending&&<ExportBanner onExport={exportCSV} label="To Do"/>}
      <div style={{background:S1,border:`0.5px solid ${BDR2}`,borderRadius:8,padding:"12px 14px",marginBottom:20}}>
        <div style={{fontSize:11,fontWeight:500,color:TXT3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Add task</div>
        <div style={{display:"flex",gap:8,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
          <select value={customSection?"__custom":newSection} onChange={e=>{ if(e.target.value==="__custom"){setCustomSection(true);setNewSection("");}else{setCustomSection(false);setNewSection(e.target.value);} }}
            style={{fontSize:12,padding:"4px 8px",borderRadius:5,border:`0.5px solid ${BDR2}`,background:S2,color:TXT,outline:"none",minWidth:160}}>
            {allSections.map(s=><option key={s} value={s}>{s}</option>)}
            <option value="__custom">+ New section…</option>
          </select>
          {customSection&&<input placeholder="Section name…" value={newSection} onChange={e=>setNewSection(e.target.value)} style={{fontSize:12,padding:"4px 8px",borderRadius:5,border:`0.5px solid ${BDR2}`,background:S2,color:TXT,outline:"none",width:160}}/>}
        </div>
        <input placeholder="Task title (required)…" value={newLabel} onChange={e=>setNewLabel(e.target.value)} onKeyDown={e=>e.key==="Enter"&&!e.shiftKey&&add()} style={{...inS,marginBottom:8}}/>
        <textarea placeholder="Detail / notes (optional)…" value={newDetail} onChange={e=>setNewDetail(e.target.value)} rows={2} style={{...inS,resize:"vertical",marginBottom:8,fontFamily:"inherit"}}/>
        <button onClick={add} disabled={!newLabel.trim()} style={{fontSize:12,padding:"5px 16px",borderRadius:5,border:`0.5px solid ${BDR2}`,background:"transparent",color:newLabel.trim()?"#72b3f5":TXT3,cursor:newLabel.trim()?"pointer":"not-allowed"}}
          onMouseEnter={e=>{ if(newLabel.trim())e.target.style.background=S2; }} onMouseLeave={e=>{ e.target.style.background="transparent"; }}>Add ↵</button>
      </div>
      {sections.length===0&&<div style={{color:TXT3,fontSize:12}}>No tasks yet.</div>}
      {sections.map(sec=>(
        <div key={sec} style={{marginBottom:20}}>
          <div style={{fontSize:11,fontWeight:500,color:TXT3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>{sec}</div>
          <div style={{display:"flex",flexDirection:"column",gap:8}}>
            {items.filter(i=>i.section===sec).map(item=>(
              <div key={item.id} style={{background:S1,border:`0.5px solid ${item.done?"rgba(99,153,34,0.3)":BDR2}`,borderRadius:8,padding:"12px 14px",display:"flex",gap:12,alignItems:"flex-start"}}
                onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background=S1}>
                <input type="checkbox" checked={item.done} onChange={()=>toggle(item.id)} style={{cursor:"pointer",accentColor:"#639922",width:14,height:14,marginTop:3,flexShrink:0}}/>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:12,fontWeight:500,color:item.done?"#6a7a6a":TXT,textDecoration:item.done?"line-through":"none",opacity:item.done?0.6:1,marginBottom:item.detail?4:0}}>{item.label}</div>
                  {item.detail&&<div style={{fontSize:11,color:item.done?TXT3:TXT2,lineHeight:1.65,opacity:item.done?0.5:1,textDecoration:item.done?"line-through":"none"}}>{item.detail}</div>}
                </div>
                <button onClick={()=>remove(item.id)} style={{background:"transparent",border:"none",cursor:"pointer",color:TXT3,fontSize:14,padding:"0 4px",flexShrink:0,lineHeight:1}}
                  onMouseEnter={e=>e.target.style.color="#f07070"} onMouseLeave={e=>e.target.style.color=TXT3}>×</button>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

// ── AIAdoptionPage ────────────────────────────────────────────────────────────
function AIAdoptionPage(){
  const [open,setOpen]=useState({});
  const [comps,setComps]=useState(INIT_COMPS);
  const [alts,setAlts]=useState(INIT_ALTS);
  const toggle=name=>setOpen(o=>({...o,[name]:!o[name]}));
  const updateComp=(i,f,v)=>setComps(c=>c.map((r,j)=>j===i?{...r,[f]:v}:r));
  const updateAlt=(i,f,v)=>setAlts(a=>a.map((r,j)=>j===i?{...r,[f]:v}:r));
  const thS={padding:"7px 10px",fontSize:11,fontWeight:500,color:TXT3,textAlign:"left",borderBottom:`0.5px solid ${BDR2}`,whiteSpace:"nowrap"};
  const tdS={padding:"6px 10px",fontSize:12,color:TXT,borderBottom:`0.5px solid ${BDR}`,verticalAlign:"middle"};
  const editS={background:"transparent",border:"none",borderBottom:`0.5px solid ${BDR2}`,color:TXT,fontSize:11,width:"100%",outline:"none",padding:"1px 2px"};
  return (
    <div>
      <div style={{fontSize:14,fontWeight:500,marginBottom:2}}>Tools — When and How to Use?</div>
      <div style={{fontSize:12,color:TXT2,marginBottom:14}}>Personal reference. Click a tool to expand.</div>
      <div style={{display:"flex",flexDirection:"column",gap:6,marginBottom:20}}>
        {DISPLAY_TOOLS.map(tool=>{ const isOpen=!!open[tool.name]; return (
          <div key={tool.name} style={{background:S1,border:`0.5px solid ${BDR2}`,borderRadius:10,overflow:"hidden"}}>
            <div onClick={()=>toggle(tool.name)} style={{borderLeft:`3px solid ${tool.accent}`,padding:"9px 14px",display:"flex",alignItems:"center",gap:10,cursor:"pointer",userSelect:"none"}}>
              <span style={{fontSize:13,fontWeight:500,color:TXT}}>{tool.name}</span>
              <span style={{fontSize:11,color:TXT2}}>— {tool.tagline}</span>
              <span style={{marginLeft:"auto",fontSize:11,color:TXT3}}>{isOpen?"▲":"▼"}</span>
            </div>
            {isOpen&&<div style={{borderTop:`0.5px solid ${BDR}`,display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(175px,1fr))"}}>
              {tool.useCases.length>0&&<AISect label="Use for" items={tool.useCases} color={TXT}/>}
              {tool.notFor.length>0&&<AISect label="Not for" items={tool.notFor} color="#f07070"/>}
              {tool.pros.length>0&&<AISect label="+" items={tool.pros} color="#a3d060"/>}
              {tool.cons.length>0&&<AISect label="−" items={tool.cons} color="#f0b84a"/>}
              {tool.neutral.length>0&&<AISect label="=" items={tool.neutral} color={TXT2}/>}
            </div>}
          </div>
        );})}
      </div>
      {CONTEXT_COST&&(
        <div style={{marginBottom:24}}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
            <div style={{background:"rgba(186,117,23,0.08)",border:`0.5px solid rgba(186,117,23,0.25)`,borderRadius:8,padding:"12px 14px"}}>
              <div style={{fontSize:12,fontWeight:500,color:"#f0b84a",marginBottom:6}}>Context cost — token burn hierarchy</div>
              {CONTEXT_COST.cons.map((c,i)=><div key={i} style={{fontSize:11,color:"#f0b84a",opacity:0.85,marginBottom:3,paddingLeft:10,position:"relative"}}><span style={{position:"absolute",left:0,opacity:0.5}}>·</span>{c}</div>)}
            </div>
            <div style={{background:"rgba(186,117,23,0.05)",border:`0.5px solid rgba(186,117,23,0.2)`,borderRadius:8,padding:"12px 14px"}}>
              <div style={{fontSize:11,fontWeight:500,color:"#f0b84a",marginBottom:10,textTransform:"uppercase",letterSpacing:"0.06em"}}>Burn order — highest to lowest</div>
              {[{label:"Large KB Projects",pct:100},{label:"Artifact iteration",pct:82,note:"Full code resent"},{label:"Extended thinking / Deep Research",pct:68},{label:"Web search + synthesis",pct:52},{label:"Long chat history",pct:36},{label:"Fresh chat",pct:16,note:"Lowest cost"}].map((item,i)=>(
                <div key={i} style={{marginBottom:7}}>
                  <div style={{display:"flex",justifyContent:"space-between",fontSize:10,color:"#f0b84a",marginBottom:3}}><span>{item.label}</span>{item.note&&<span style={{opacity:0.5,fontStyle:"italic"}}>{item.note}</span>}</div>
                  <div style={{height:5,background:"rgba(186,117,23,0.12)",borderRadius:3}}><div style={{height:"100%",width:`${item.pct}%`,background:`rgba(240,184,74,${0.3+item.pct/250})`,borderRadius:3}}/></div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
      <div style={{fontSize:13,fontWeight:500,color:TXT,marginBottom:4}}>Alternatives to Claude CoWork</div>
      <div style={{fontSize:11,color:TXT2,marginBottom:12}}>Autonomous, Datapoints &amp; Access Hungry</div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1px 1fr",background:S1,border:`0.5px solid ${BDR2}`,borderRadius:10,overflow:"hidden",marginBottom:20}}>
        <div style={{padding:"0 0 8px",minWidth:0}}>
          <div style={{fontSize:11,fontWeight:500,color:TXT3,padding:"10px 12px 6px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Platform comps</div>
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
            <colgroup><col style={{width:"22%"}}/><col style={{width:"13%"}}/><col style={{width:"13%"}}/><col style={{width:"22%"}}/><col style={{width:"30%"}}/></colgroup>
            <thead><tr>{["","Notion","G Drive","SharePoint","CoWork equiv.?"].map(h=><th key={h} style={{...thS,fontSize:10}}>{h}</th>)}</tr></thead>
            <tbody>{comps.map((row,i)=>(
              <tr key={i}>
                <td style={{...tdS,fontWeight:500,fontSize:11}}>{row.name}</td>
                <td style={{...tdS,textAlign:"center"}}><input type="checkbox" checked={row.notion} onChange={e=>updateComp(i,"notion",e.target.checked)} style={{cursor:"pointer",accentColor:"#378ADD",width:13,height:13}}/></td>
                <td style={{...tdS,textAlign:"center"}}><input type="checkbox" checked={row.gdrive} onChange={e=>updateComp(i,"gdrive",e.target.checked)} style={{cursor:"pointer",accentColor:"#378ADD",width:13,height:13}}/></td>
                <td style={tdS}><input value={row.sharepoint} onChange={e=>updateComp(i,"sharepoint",e.target.value)} style={editS}/></td>
                <td style={tdS}><input value={row.cowork} onChange={e=>updateComp(i,"cowork",e.target.value)} style={editS}/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div style={{background:BDR2}}/>
        <div style={{padding:"0 0 8px",minWidth:0}}>
          <div style={{fontSize:11,fontWeight:500,color:TXT3,padding:"10px 12px 6px",textTransform:"uppercase",letterSpacing:"0.06em"}}>Agent alternatives</div>
          <table style={{width:"100%",borderCollapse:"collapse",tableLayout:"fixed"}}>
            <colgroup><col style={{width:"34%"}}/><col style={{width:"33%"}}/><col style={{width:"33%"}}/></colgroup>
            <thead><tr>{["Alternative","CoWork","Personal"].map(h=><th key={h} style={{...thS,fontSize:10}}>{h}</th>)}</tr></thead>
            <tbody>{alts.map((row,i)=>(
              <tr key={i}>
                <td style={tdS}><input value={row.alt} onChange={e=>updateAlt(i,"alt",e.target.value)} style={editS}/></td>
                <td style={tdS}><input value={row.cowork} onChange={e=>updateAlt(i,"cowork",e.target.value)} style={editS}/></td>
                <td style={tdS}><input value={row.personal} onChange={e=>updateAlt(i,"personal",e.target.value)} style={editS}/></td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ── FlowPage ──────────────────────────────────────────────────────────────────
function FlowPage(){
  const [nodes,setNodes]=useState(INIT_FLOW_NODES);
  const [edges,setEdges]=useState(INIT_FLOW_EDGES);
  const [sel,setSel]=useState([]);
  const [connecting,setConnecting]=useState(null);
  const [dragging,setDragging]=useState(null);
  const [editingId,setEditingId]=useState(null);
  const [editText,setEditText]=useState("");
  const [saveMsg,setSaveMsg]=useState("");
  const [selBox,setSelBox]=useState(null);
  const [tableData,setTableData]=useState(INIT_TABLE_DATA);
  const [notepad,setNotepad]=useState("");
  const svgRef=useRef(null);
  const selBoxStart=useRef(null);
  const nid=useRef(4);
  const eid=useRef(3);

  useEffect(()=>{
    (async()=>{
      try{
        const r=await window.localStorage.getItem(FLOW_KEY);
        if(r){
          const p=JSON.parse(r);
          if(p.nodes)setNodes(p.nodes);
          if(p.edges)setEdges(p.edges);
          if(p.tableData)setTableData(p.tableData);
          if(p.notepad!==undefined)setNotepad(p.notepad);
        }
      } catch{}
    })();
  },[]);

  const persistAll=useCallback(async(n,e,td,np)=>{
    try{
      await window.localStorage.setItem(FLOW_KEY,JSON.stringify({nodes:n,edges:e,tableData:td,notepad:np}));
      setSaveMsg("Saved"); setTimeout(()=>setSaveMsg(""),1500);
    } catch{}
  },[]);

  // ── canvas helpers ──
  const setN=(n,e2=edges)=>{ setNodes(n); setEdges(e2); persistAll(n,e2,tableData,notepad); };
  const updNode=(id,patch)=>setN(nodes.map(x=>x.id===id?{...x,...patch}:x));
  const delEdge=id=>{ const e2=edges.filter(x=>x.id!==id); setEdges(e2); persistAll(nodes,e2,tableData,notepad); };

  // ── table helpers ──
  const setTD=td=>{ setTableData(td); persistAll(nodes,edges,td,notepad); };
  const setNP=np=>{ setNotepad(np); persistAll(nodes,edges,tableData,np); };
  const addTableRow=()=>setTD({...tableData,rows:[...tableData.rows,new Array(tableData.cols.length).fill("")]});
  const addTableCol=()=>setTD({cols:[...tableData.cols,"Column"],rows:tableData.rows.map(r=>[...r,""])});
  const delTableRow=i=>setTD({...tableData,rows:tableData.rows.filter((_,j)=>j!==i)});
  const delTableCol=i=>setTD({cols:tableData.cols.filter((_,j)=>j!==i),rows:tableData.rows.map(r=>r.filter((_,j)=>j!==i))});
  const updCell=(ri,ci,v)=>setTD({...tableData,rows:tableData.rows.map((r,i)=>i===ri?r.map((c,j)=>j===ci?v:c):r)});
  const updHeader=(ci,v)=>setTD({...tableData,cols:tableData.cols.map((c,i)=>i===ci?v:c)});

  // ── node actions ──
  const addNode=()=>{ const id="n"+(nid.current++); setN([...nodes,{id,x:60+Math.random()*160,y:60+Math.random()*160,w:NODE_W,h:NODE_H,label:"Node",shape:"rect",color:"#378ADD"}]); setSel([id]); };
  const addTableNode=()=>{ const id="n"+(nid.current++); const t=makeTable(); const w=t.cols.length*TABLE_COL_W; const h=TABLE_HEADER_H+t.rows.length*TABLE_ROW_H; setN([...nodes,{id,x:60+Math.random()*120,y:60+Math.random()*120,w,h,label:"Table",shape:"table",color:"#378ADD",table:t}]); setSel([id]); };
  const delNode=id=>{ setN(nodes.filter(n=>n.id!==id),edges.filter(e=>e.from!==id&&e.to!==id)); setSel(s=>s.filter(x=>x!==id)); };
  const delSelected=()=>{ const ids=[...sel]; setN(nodes.filter(n=>!ids.includes(n.id)),edges.filter(e=>!ids.includes(e.from)&&!ids.includes(e.to))); setSel([]); };

  const align=useCallback(dir=>{
    setNodes(curr=>{
      const sn=curr.filter(n=>sel.includes(n.id));
      if(sn.length<2)return curr;
      let ref;
      if(dir==="top")    ref=Math.min(...sn.map(n=>n.y));
      if(dir==="bottom") ref=Math.max(...sn.map(n=>n.y+n.h));
      if(dir==="left")   ref=Math.min(...sn.map(n=>n.x));
      if(dir==="right")  ref=Math.max(...sn.map(n=>n.x+n.w));
      if(dir==="centerH")ref=Math.round(sn.reduce((a,n)=>a+n.x+n.w/2,0)/sn.length);
      if(dir==="centerV")ref=Math.round(sn.reduce((a,n)=>a+n.y+n.h/2,0)/sn.length);
      const updated=curr.map(node=>{
        if(!sel.includes(node.id))return node;
        if(dir==="top")    return{...node,y:ref};
        if(dir==="bottom") return{...node,y:ref-node.h};
        if(dir==="left")   return{...node,x:ref};
        if(dir==="right")  return{...node,x:ref-node.w};
        if(dir==="centerH")return{...node,x:Math.round(ref-node.w/2)};
        if(dir==="centerV")return{...node,y:Math.round(ref-node.h/2)};
        return node;
      });
      persistAll(updated,edges,tableData,notepad);
      return updated;
    });
  },[sel,edges,tableData,notepad,persistAll]);

  // ── mouse handlers ──
  const onNodeMouseDown=(e,id)=>{
    if(e.target.tagName==="INPUT"||e.target.tagName==="TEXTAREA"){ setSel(prev=>prev.includes(id)?prev:e.shiftKey?[...prev,id]:[id]); return; }
    if(connecting){ if(id!==connecting){ const ne=[...edges,{id:"e"+(eid.current++),from:connecting,to:id}]; setEdges(ne); persistAll(nodes,ne,tableData,notepad); } setConnecting(null); e.stopPropagation(); return; }
    e.stopPropagation();
    const ns=e.shiftKey?(sel.includes(id)?sel.filter(x=>x!==id):[...sel,id]):[id];
    setSel(ns);
    const sv=svgRef.current.getBoundingClientRect();
    const sp={}; nodes.forEach(n=>{ sp[n.id]={x:n.x,y:n.y}; });
    setDragging({ids:ns,startMouse:{x:e.clientX-sv.left,y:e.clientY-sv.top},startPositions:sp});
  };
  const onSvgMouseDown=e=>{ if(e.target!==svgRef.current)return; if(connecting){setConnecting(null);return;} setSel([]); const sv=svgRef.current.getBoundingClientRect(); const x=e.clientX-sv.left,y=e.clientY-sv.top; selBoxStart.current={x,y}; setSelBox({x,y,w:0,h:0}); };
  const onMouseMove=e=>{
    const sv=svgRef.current.getBoundingClientRect(); const mx=e.clientX-sv.left,my=e.clientY-sv.top;
    if(dragging){ const dx=mx-dragging.startMouse.x,dy=my-dragging.startMouse.y; setNodes(ns=>ns.map(n=>dragging.ids.includes(n.id)?{...n,x:Math.max(0,dragging.startPositions[n.id].x+dx),y:Math.max(0,dragging.startPositions[n.id].y+dy)}:n)); }
    else if(selBoxStart.current){ const sx=selBoxStart.current.x,sy=selBoxStart.current.y; setSelBox({x:Math.min(sx,mx),y:Math.min(sy,my),w:Math.abs(mx-sx),h:Math.abs(my-sy)}); }
  };
  const onMouseUp=()=>{
    if(dragging){ persistAll(nodes,edges,tableData,notepad); setDragging(null); }
    if(selBoxStart.current&&selBox){ const{x,y,w,h}=selBox; if(w>4||h>4)setSel(nodes.filter(n=>n.x+n.w>x&&n.x<x+w&&n.y+n.h>y&&n.y<y+h).map(n=>n.id)); selBoxStart.current=null; setSelBox(null); }
  };
  const startEdit=(e,id,label)=>{ e.stopPropagation(); setEditingId(id); setEditText(label); };
  const commitEdit=()=>{ if(editingId){ updNode(editingId,{label:editText}); setEditingId(null); } };

  // ── edge routing ──
  const anchors=n=>({top:{x:n.x+n.w/2,y:n.y},bottom:{x:n.x+n.w/2,y:n.y+n.h},left:{x:n.x,y:n.y+n.h/2},right:{x:n.x+n.w,y:n.y+n.h/2}});
  const edgePath=(from,to)=>{
    const a=nodes.find(n=>n.id===from),b=nodes.find(n=>n.id===to); if(!a||!b)return null;
    const aa=anchors(a),ba=anchors(b); let best=null,bestD=Infinity;
    for(const ak of Object.keys(aa))for(const bk of Object.keys(ba)){ const dx=aa[ak].x-ba[bk].x,dy=aa[ak].y-ba[bk].y,d=Math.sqrt(dx*dx+dy*dy); if(d<bestD){bestD=d;best={a:aa[ak],b:ba[bk],ak,bk};} }
    if(!best)return null;
    const{a:p1,b:p2,ak,bk}=best; const off=50;
    const dir={top:[0,-off],bottom:[0,off],left:[-off,0],right:[off,0]};
    const[dx1,dy1]=dir[ak],[dx2,dy2]=dir[bk];
    return `M${p1.x},${p1.y} C${p1.x+dx1},${p1.y+dy1} ${p2.x+dx2},${p2.y+dy2} ${p2.x},${p2.y}`;
  };

  // ── node renderer ──
  const renderNode=n=>{
    const{x,y,w,h,shape,color,label,id,table}=n;
    const isSel=sel.includes(id); const isConn=connecting===id;
    const stroke=isConn?"#f0b84a":isSel?"#72b3f5":color+"99"; const sw=isSel||isConn?2:1;
    if(shape==="table"&&table){
      const cols=table.cols||[]; const rows=table.rows||[]; const cw=w/Math.max(cols.length,1);
      return (
        <g key={id} style={{cursor:connecting?"crosshair":"move"}} onMouseDown={e=>onNodeMouseDown(e,id)}>
          <rect x={x} y={y} width={w} height={h} rx="4" fill={S1} stroke={stroke} strokeWidth={sw}/>
          <rect x={x} y={y} width={w} height={TABLE_HEADER_H} rx="4" fill={color+"33"}/>
          <rect x={x} y={y+TABLE_HEADER_H-1} width={w} height={1} fill={color+"66"}/>
          {cols.map((c,ci)=>(
            <g key={ci}>
              {ci>0&&<line x1={x+ci*cw} y1={y} x2={x+ci*cw} y2={y+h} stroke={color+"33"} strokeWidth="0.5"/>}
              <foreignObject x={x+ci*cw+2} y={y+2} width={cw-4} height={TABLE_HEADER_H-4}>
                <input value={c} onChange={e=>{ const nc=[...cols]; nc[ci]=e.target.value; updNode(id,{table:{...table,cols:nc}}); }} style={{width:"100%",height:"100%",background:"transparent",border:"none",outline:"none",color,fontSize:10,fontWeight:600,textAlign:"center",fontFamily:"system-ui",boxSizing:"border-box"}}/>
              </foreignObject>
            </g>
          ))}
          {rows.map((row,ri)=>(
            <g key={ri}>
              <line x1={x} y1={y+TABLE_HEADER_H+ri*TABLE_ROW_H} x2={x+w} y2={y+TABLE_HEADER_H+ri*TABLE_ROW_H} stroke={color+"22"} strokeWidth="0.5"/>
              {row.map((cell,ci)=>(
                <g key={ci}>
                  {ci>0&&<line x1={x+ci*cw} y1={y+TABLE_HEADER_H+ri*TABLE_ROW_H} x2={x+ci*cw} y2={y+TABLE_HEADER_H+(ri+1)*TABLE_ROW_H} stroke={color+"22"} strokeWidth="0.5"/>}
                  <foreignObject x={x+ci*cw+2} y={y+TABLE_HEADER_H+ri*TABLE_ROW_H+1} width={cw-4} height={TABLE_ROW_H-2}>
                    <input value={cell} onChange={e=>{ const nr=rows.map((r,i)=>i===ri?r.map((c,j)=>j===ci?e.target.value:c):r); updNode(id,{table:{...table,rows:nr}}); }} style={{width:"100%",height:"100%",background:"transparent",border:"none",outline:"none",color:TXT2,fontSize:9,fontFamily:"system-ui",boxSizing:"border-box",padding:"0 2px"}}/>
                  </foreignObject>
                </g>
              ))}
            </g>
          ))}
          <g style={{cursor:"pointer"}} onClick={e=>{ e.stopPropagation(); const nr=[...rows,new Array(cols.length).fill("")]; updNode(id,{table:{...table,rows:nr},h:TABLE_HEADER_H+nr.length*TABLE_ROW_H}); }}>
            <rect x={x} y={y+h} width={w} height={TABLE_ROW_H} fill="transparent"/>
            <text x={x+w/2} y={y+h+TABLE_ROW_H/2+4} textAnchor="middle" fontSize="10" fill={color+"88"} style={{userSelect:"none"}}>+ row</text>
          </g>
          <g style={{cursor:"pointer"}} onClick={e=>{ e.stopPropagation(); const nc=[...cols,"Col"]; const nr=rows.map(r=>[...r,""]); updNode(id,{table:{cols:nc,rows:nr},w:nc.length*TABLE_COL_W}); }}>
            <rect x={x+w} y={y} width={22} height={TABLE_HEADER_H} fill="transparent"/>
            <text x={x+w+11} y={y+TABLE_HEADER_H/2+4} textAnchor="middle" fontSize="11" fill={color+"88"} style={{userSelect:"none"}}>+</text>
          </g>
        </g>
      );
    }
    let shapeEl;
    if(shape==="rounded")shapeEl=<rect x={x} y={y} width={w} height={h} rx="10" fill={color+"22"} stroke={stroke} strokeWidth={sw}/>;
    else if(shape==="diamond"){const mx=x+w/2,my=y+h/2;shapeEl=<polygon points={`${mx},${y} ${x+w},${my} ${mx},${y+h} ${x},${my}`} fill={color+"22"} stroke={stroke} strokeWidth={sw}/>;}
    else if(shape==="oval")shapeEl=<ellipse cx={x+w/2} cy={y+h/2} rx={w/2} ry={h/2} fill={color+"22"} stroke={stroke} strokeWidth={sw}/>;
    else shapeEl=<rect x={x} y={y} width={w} height={h} rx="4" fill={color+"22"} stroke={stroke} strokeWidth={sw}/>;
    return (
      <g key={id} style={{cursor:connecting?"crosshair":"move"}} onMouseDown={e=>onNodeMouseDown(e,id)} onDoubleClick={e=>startEdit(e,id,label)}>
        {shapeEl}
        {editingId===id
          ?<foreignObject x={x+4} y={y+h/2-12} width={w-8} height={24}>
              <input value={editText} onChange={e=>setEditText(e.target.value)} onBlur={commitEdit} onKeyDown={e=>{ if(e.key==="Enter")commitEdit(); }} autoFocus style={{width:"100%",background:"transparent",border:"none",outline:"none",color,fontSize:11,textAlign:"center",fontFamily:"system-ui"}}/>
            </foreignObject>
          :<text x={x+w/2} y={y+h/2+4} textAnchor="middle" fontSize="11" fill={color} style={{pointerEvents:"none",userSelect:"none"}}>{label}</text>
        }
      </g>
    );
  };

  const exportSVG=()=>{ const s=svgRef.current; if(!s)return; const blob=new Blob([s.outerHTML],{type:"image/svg+xml"}); const url=URL.createObjectURL(blob); const a=document.createElement("a"); a.href=url; a.download="flowchart.svg"; document.body.appendChild(a); a.click(); document.body.removeChild(a); setTimeout(()=>URL.revokeObjectURL(url),1000); };
  const selNode=sel.length===1?nodes.find(n=>n.id===sel[0]):null;
  const inputS={fontSize:11,padding:"3px 7px",borderRadius:4,border:`0.5px solid ${BDR2}`,background:S2,color:TXT,outline:"none",width:"100%"};

  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10,flexWrap:"wrap"}}>
        <span style={{fontSize:14,fontWeight:500}}>Flow Editor</span>
        <span style={{fontSize:11,color:TXT2}}>— drag · dbl-click rename · select+Connect for edges · click edge to delete</span>
        <span style={{flex:1}}/>
        <Btn onClick={addNode}>+ Node</Btn>
        <Btn onClick={addTableNode}>+ Table</Btn>
        <Btn onClick={exportSVG}>Export SVG ↓</Btn>
        <span style={{fontSize:11,color:TXT3}}>{saveMsg}</span>
      </div>

      {/* Canvas + Inspector */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 190px",gap:10,alignItems:"start"}}>
        <div style={{border:`0.5px solid ${BDR2}`,borderRadius:8,background:S1,overflow:"hidden"}}>
          <svg ref={svgRef} width="100%" height="520" style={{display:"block",cursor:connecting?"crosshair":"default"}} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onMouseDown={onSvgMouseDown}>
            <defs><marker id="flarr" markerWidth="8" markerHeight="8" refX="7" refY="3" orient="auto"><path d="M0,0 L0,6 L8,3 z" fill="rgba(255,255,255,0.5)"/></marker></defs>
            {edges.map(e=>{ const p=edgePath(e.from,e.to); if(!p)return null; return (
              <g key={e.id} onClick={ev=>{ ev.stopPropagation(); delEdge(e.id); }}>
                <path d={p} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="8" style={{cursor:"pointer"}}/>
                <path d={p} fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" markerEnd="url(#flarr)" style={{pointerEvents:"none"}}/>
              </g>
            ); })}
            {nodes.map(n=>renderNode(n))}
            {selBox&&selBox.w>2&&<rect x={selBox.x} y={selBox.y} width={selBox.w} height={selBox.h} fill="rgba(55,138,221,0.07)" stroke="rgba(55,138,221,0.5)" strokeWidth="1" strokeDasharray="4,3"/>}
            {connecting&&<text x="8" y="16" fontSize="10" fill="#f0b84a">Click a node to connect — click canvas to cancel</text>}
          </svg>
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {sel.length>=2&&(
            <div style={{background:S1,border:`0.5px solid ${BDR2}`,borderRadius:8,padding:"10px 12px"}}>
              <div style={{fontSize:11,fontWeight:500,color:TXT3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:8}}>Align {sel.length} nodes</div>
              <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                {[["top","↑ Top"],["bottom","↓ Bot"],["left","← Left"],["right","→ Right"],["centerH","— Ctr H"],["centerV","| Ctr V"]].map(([d,lbl])=>(
                  <button key={d} onClick={()=>align(d)} style={{fontSize:10,padding:"4px 2px",borderRadius:4,border:`0.5px solid ${BDR2}`,background:"transparent",color:TXT2,cursor:"pointer"}} onMouseEnter={e=>e.target.style.background=S2} onMouseLeave={e=>e.target.style.background="transparent"}>{lbl}</button>
                ))}
              </div>
              <div style={{marginTop:8}}><Btn onClick={delSelected} style={{fontSize:11,color:"#f07070",width:"100%"}}>Delete selected</Btn></div>
            </div>
          )}
          {selNode?(
            <div style={{background:S1,border:`0.5px solid ${BDR2}`,borderRadius:8,padding:"12px",overflowY:"auto",maxHeight:460}}>
              <div style={{fontSize:11,fontWeight:500,color:TXT3,textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:10}}>Node</div>
              {selNode.shape!=="table"&&<>
                <div style={{fontSize:11,color:TXT2,marginBottom:4}}>Label</div>
                <input value={selNode.label} onChange={e=>updNode(selNode.id,{label:e.target.value})} style={{...inputS,marginBottom:10}}/>
                <div style={{fontSize:11,color:TXT2,marginBottom:4}}>Shape</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4,marginBottom:10}}>
                  {["rect","rounded","diamond","oval"].map(s=>(
                    <button key={s} onClick={()=>updNode(selNode.id,{shape:s})} style={{fontSize:10,padding:"3px 4px",borderRadius:4,border:`0.5px solid ${selNode.shape===s?"#72b3f5":BDR}`,background:selNode.shape===s?"rgba(55,138,221,0.15)":"transparent",color:selNode.shape===s?"#72b3f5":TXT2,cursor:"pointer"}}>{s}</button>
                  ))}
                </div>
                <div style={{fontSize:11,color:TXT2,marginBottom:4}}>Color</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:5,marginBottom:10}}>
                  {NODE_COLORS.map(c=><div key={c} onClick={()=>updNode(selNode.id,{color:c})} style={{width:18,height:18,borderRadius:3,background:c,cursor:"pointer",border:selNode.color===c?"2px solid #fff":"2px solid transparent"}}/>)}
                </div>
              </>}
              {selNode.shape==="table"&&selNode.table&&<>
                <div style={{fontSize:11,color:TXT2,marginBottom:6}}>Columns</div>
                <div style={{display:"flex",gap:3,marginBottom:6,alignItems:"center"}}>
                  {selNode.table.cols.map((c,ci)=>(
                    <input key={ci} value={c} onChange={e=>{ const cols=[...selNode.table.cols]; cols[ci]=e.target.value; updNode(selNode.id,{table:{...selNode.table,cols}}); }} style={{...inputS,fontSize:10,textAlign:"center",flex:1,minWidth:0,fontWeight:600,color:selNode.color}}/>
                  ))}
                  <button onClick={()=>{ const cols=[...selNode.table.cols,"Col"]; const rows=selNode.table.rows.map(r=>[...r,""]); updNode(selNode.id,{table:{cols,rows},w:cols.length*TABLE_COL_W}); }} style={{fontSize:11,background:"transparent",border:`0.5px solid ${BDR2}`,borderRadius:3,color:TXT2,cursor:"pointer",padding:"1px 5px"}}>+</button>
                  <button onClick={()=>{ if(selNode.table.cols.length<=1)return; const cols=selNode.table.cols.slice(0,-1); const rows=selNode.table.rows.map(r=>r.slice(0,-1)); updNode(selNode.id,{table:{cols,rows},w:cols.length*TABLE_COL_W}); }} style={{fontSize:11,background:"transparent",border:`0.5px solid ${BDR2}`,borderRadius:3,color:"#f07070",cursor:"pointer",padding:"1px 5px"}}>−</button>
                </div>
                <div style={{fontSize:11,color:TXT2,marginBottom:4}}>Rows</div>
                {selNode.table.rows.map((row,ri)=>(
                  <div key={ri} style={{display:"flex",gap:3,marginBottom:3,alignItems:"center"}}>
                    <span style={{fontSize:9,color:TXT3,width:14,flexShrink:0}}>{ri+1}</span>
                    {row.map((cell,ci)=><input key={ci} value={cell} onChange={e=>{ const rows=selNode.table.rows.map((r,i)=>i===ri?r.map((c,j)=>j===ci?e.target.value:c):r); updNode(selNode.id,{table:{...selNode.table,rows}}); }} style={{...inputS,fontSize:10,flex:1,minWidth:0}}/>)}
                    <button onClick={()=>{ const rows=selNode.table.rows.filter((_,i)=>i!==ri); updNode(selNode.id,{table:{...selNode.table,rows},h:TABLE_HEADER_H+rows.length*TABLE_ROW_H}); }} style={{fontSize:11,background:"transparent",border:"none",color:TXT3,cursor:"pointer",padding:"0 2px"}} onMouseEnter={e=>e.target.style.color="#f07070"} onMouseLeave={e=>e.target.style.color=TXT3}>×</button>
                  </div>
                ))}
                <button onClick={()=>{ const rows=[...selNode.table.rows,new Array(selNode.table.cols.length).fill("")]; updNode(selNode.id,{table:{...selNode.table,rows},h:TABLE_HEADER_H+rows.length*TABLE_ROW_H}); }} style={{fontSize:10,marginTop:4,marginBottom:8,padding:"2px 10px",borderRadius:4,border:`0.5px solid ${BDR2}`,background:"transparent",color:TXT2,cursor:"pointer",width:"100%"}}>+ row</button>
                <div style={{fontSize:11,color:TXT2,marginBottom:4}}>Header color</div>
                <div style={{display:"flex",flexWrap:"wrap",gap:4,marginBottom:8}}>
                  {NODE_COLORS.map(c=><div key={c} onClick={()=>updNode(selNode.id,{color:c})} style={{width:16,height:16,borderRadius:3,background:c,cursor:"pointer",border:selNode.color===c?"2px solid #fff":"2px solid transparent"}}/>)}
                </div>
              </>}
              <div style={{borderTop:`0.5px solid ${BDR}`,paddingTop:8,marginTop:4,marginBottom:10}}>
                <div style={{fontSize:10,color:TXT3,marginBottom:6,textTransform:"uppercase",letterSpacing:"0.05em"}}>Position / Size</div>
                <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:4}}>
                  {[["X",selNode.x,"x"],["Y",selNode.y,"y"],["W",selNode.w,"w"],["H",selNode.h,"h"]].map(([lbl,val,key])=>(
                    <div key={key}>
                      <div style={{fontSize:9,color:TXT3,marginBottom:2}}>{lbl}</div>
                      <input type="number" value={Math.round(val)} onChange={e=>updNode(selNode.id,{[key]:Number(e.target.value)})} style={{...inputS,fontSize:11,boxSizing:"border-box"}}/>
                    </div>
                  ))}
                </div>
              </div>
              <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
                <Btn onClick={()=>setConnecting(selNode.id)} style={{fontSize:11,color:"#72b3f5"}}>→ Connect</Btn>
                <Btn onClick={()=>delNode(selNode.id)} style={{fontSize:11,color:"#f07070"}}>Delete</Btn>
              </div>
            </div>
          ):sel.length===0&&(
            <div style={{background:S1,border:`0.5px solid ${BDR2}`,borderRadius:8,padding:"12px"}}>
              <div style={{fontSize:11,color:TXT3,lineHeight:1.8}}>
                <div style={{fontWeight:500,color:TXT2,marginBottom:6}}>How to use</div>
                <div>· Drag nodes to move</div>
                <div>· Shift+click multi-select</div>
                <div>· Drag canvas to rubber-band</div>
                <div>· Double-click to rename</div>
                <div>· Select → Connect for edge</div>
                <div>· Click edge to delete</div>
                <div style={{marginTop:8,fontSize:10,color:TXT3}}>Auto-saved to this device.</div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Bottom: Table 3/4 + Notepad 1/4 */}
      <div style={{display:"grid",gridTemplateColumns:"3fr 1fr",gap:10,marginTop:12}}>
        <div style={{background:S1,border:`0.5px solid ${BDR2}`,borderRadius:8,overflow:"hidden"}}>
          <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 12px",borderBottom:`0.5px solid ${BDR2}`}}>
            <span style={{fontSize:12,fontWeight:500,color:TXT}}>Table</span>
            <span style={{flex:1}}/>
            <button onClick={addTableCol} style={{fontSize:11,padding:"2px 10px",borderRadius:4,border:`0.5px solid ${BDR2}`,background:"transparent",color:TXT2,cursor:"pointer"}} onMouseEnter={e=>e.target.style.background=S2} onMouseLeave={e=>e.target.style.background="transparent"}>+ Col</button>
            <button onClick={addTableRow} style={{fontSize:11,padding:"2px 10px",borderRadius:4,border:`0.5px solid ${BDR2}`,background:"transparent",color:TXT2,cursor:"pointer"}} onMouseEnter={e=>e.target.style.background=S2} onMouseLeave={e=>e.target.style.background="transparent"}>+ Row</button>
          </div>
          <div style={{overflowX:"auto"}}>
            <table style={{width:"100%",borderCollapse:"collapse",fontSize:11}}>
              <thead style={{background:S2}}>
                <tr>
                  {tableData.cols.map((col,ci)=>(
                    <th key={ci} style={{padding:0,borderBottom:`0.5px solid ${BDR2}`,borderRight:`0.5px solid ${BDR}`}}>
                      <div style={{display:"flex",alignItems:"center"}}>
                        <input value={col} onChange={e=>updHeader(ci,e.target.value)} style={{flex:1,background:"transparent",border:"none",outline:"none",color:"#72b3f5",fontSize:11,fontWeight:500,padding:"6px 8px"}}/>
                        <button onClick={()=>delTableCol(ci)} style={{background:"transparent",border:"none",color:TXT3,cursor:"pointer",padding:"0 6px",fontSize:12,lineHeight:1}} onMouseEnter={e=>e.target.style.color="#f07070"} onMouseLeave={e=>e.target.style.color=TXT3}>×</button>
                      </div>
                    </th>
                  ))}
                  <th style={{width:24,borderBottom:`0.5px solid ${BDR2}`}}/>
                </tr>
              </thead>
              <tbody>
                {tableData.rows.map((row,ri)=>(
                  <tr key={ri} onMouseEnter={e=>e.currentTarget.style.background=S2} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                    {row.map((cell,ci)=>(
                      <td key={ci} style={{borderBottom:`0.5px solid ${BDR}`,borderRight:`0.5px solid ${BDR}`,padding:0}}>
                        <input value={cell} onChange={e=>updCell(ri,ci,e.target.value)} style={{width:"100%",background:"transparent",border:"none",outline:"none",color:TXT,fontSize:11,padding:"5px 8px",boxSizing:"border-box"}}/>
                      </td>
                    ))}
                    <td style={{borderBottom:`0.5px solid ${BDR}`,textAlign:"center",width:24}}>
                      <button onClick={()=>delTableRow(ri)} style={{background:"transparent",border:"none",color:TXT3,cursor:"pointer",fontSize:12,padding:"0 4px",lineHeight:1}} onMouseEnter={e=>e.target.style.color="#f07070"} onMouseLeave={e=>e.target.style.color=TXT3}>×</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div style={{background:S1,border:`0.5px solid ${BDR2}`,borderRadius:8,display:"flex",flexDirection:"column",overflow:"hidden"}}>
          <div style={{padding:"8px 12px",borderBottom:`0.5px solid ${BDR2}`,fontSize:12,fontWeight:500,color:TXT}}>Notepad</div>
          <textarea value={notepad} onChange={e=>setNP(e.target.value)} placeholder="Notes, links, reminders…" style={{flex:1,background:"transparent",border:"none",outline:"none",color:TXT2,fontSize:11,padding:"10px 12px",resize:"none",fontFamily:"system-ui",lineHeight:1.65,minHeight:180}}/>
        </div>
      </div>
    </div>
  );
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App(){
  const [data,setData]=useState(null);
  const [loaded,setLoaded]=useState(false);
  const [saving,setSaving]=useState(false);
  const [saveMsg,setSaveMsg]=useState("");
  const [pendingExport,setPendingExport]=useState(false);
  const [page,setPage]=useState("Coverage");
  const [tab,setTab]=useState("Universe");
  const [filters,setFilters]=useState({list:"All",region:"All",analyst:"All"});
  const [search,setSearch]=useState("");
  const [sortCol,setSortCol]=useState(null);
  const [sortDir,setSortDir]=useState("asc");
  const [editing,setEditing]=useState(null);
  const [editVal,setEditVal]=useState({});
  const [aiTicker,setAiTicker]=useState("");
  const [aiResult,setAiResult]=useState("");
  const [aiLoading,setAiLoading]=useState(false);
  const [importErr,setImportErr]=useState("");
  const firstLoad=useRef(true);

  useEffect(()=>{
    (async()=>{
      try{
        const res=await window.localStorage.getItem(STORAGE_KEY);
        if(res){
          const parsed=JSON.parse(res);
          const merged={};
          ALL_TICKERS.forEach(({ticker})=>{ merged[ticker]=parsed[ticker]||SEED[ticker]||initRow(); });
          setData(merged);
        } else {
          const fresh={};
          ALL_TICKERS.forEach(({ticker})=>{ fresh[ticker]=SEED[ticker]||initRow(); });
          setData(fresh);
        }
      } catch {
        const fresh={};
        ALL_TICKERS.forEach(({ticker})=>{ fresh[ticker]=SEED[ticker]||initRow(); });
        setData(fresh);
      }
      setLoaded(true);
    })();
  },[]);

  const persist=useCallback(async nd=>{
    setSaving(true);
    try{ await window.localStorage.setItem(STORAGE_KEY,JSON.stringify(nd)); setSaveMsg("Saved"); setTimeout(()=>setSaveMsg(""),1800); }
    catch{ setSaveMsg("Save failed"); }
    setSaving(false);
  },[]);

  const applyData=nd=>{ setData(nd); persist(nd); if(!firstLoad.current)setPendingExport(true); firstLoad.current=false; };
  const startEdit=t=>{ setEditing(t); setEditVal({...data[t]}); };
  const saveEdit=t=>{ applyData({...data,[t]:{...editVal}}); setEditing(null); };
  const today=new Date().toISOString().slice(0,10);

  const exportCSV=()=>{ if(!data)return; try{ triggerDownload(toCSV(data),`coverage_${today}.csv`); setPendingExport(false); } catch(e){ setSaveMsg("Export failed: "+e.message); } };
  const importCSV=e=>{
    const file=e.target.files?.[0]; if(!file)return;
    const reader=new FileReader();
    reader.onload=ev=>{ const nd=fromCSV(ev.target.result,data); if(!nd){setImportErr("Could not parse CSV.");return;} firstLoad.current=true; applyData(nd); setImportErr(""); setSaveMsg("Imported"); setTimeout(()=>setSaveMsg(""),2000); };
    reader.onerror=()=>setImportErr("File read error.");
    reader.readAsText(file); e.target.value="";
  };

  const runAI=async()=>{
    if(!aiTicker)return; setAiLoading(true); setAiResult("");
    try{
      const ctrl=new AbortController(); const t=setTimeout(()=>ctrl.abort(),35000);
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",signal:ctrl.signal,headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,tools:[{type:"web_search_20250305",name:"web_search"}],
          messages:[{role:"user",content:`You are a senior equity research analyst. For ${aiTicker.toUpperCase()}, write a concise brief: (1) what the company does, (2) 2-3 recent material developments past 30 days, (3) key upcoming catalysts. Plain text, 3 short paragraphs, no headers, no bullets. Factual and terse.`}]})});
      clearTimeout(t);
      const json=await res.json();
      setAiResult(json.content?.filter(b=>b.type==="text"&&b.text?.trim()).map(b=>b.text).join("\n")||json.error?.message||"No result.");
    } catch(e){ setAiResult(e.name==="AbortError"?"Timed out after 35s.":"Error: "+e.message); }
    setAiLoading(false);
  };

  if(!loaded||!data) return <div style={{background:BG,minHeight:400,padding:"2rem",color:TXT2,fontSize:14}}>Loading…</div>;

  const toggleSort=col=>{ if(sortCol===col)setSortDir(d=>d==="asc"?"desc":"asc"); else{setSortCol(col);setSortDir("asc");} };
  const sortIcon=col=>sortCol===col?(sortDir==="asc"?" ↑":" ↓"):" ↕";
  const filteredRows=ALL_TICKERS.filter(({ticker,list,region})=>{
    const d=data[ticker];
    if(filters.list!=="All"&&list!==filters.list)return false;
    if(filters.region!=="All"&&region!==filters.region)return false;
    if(filters.analyst==="Jenson"&&d.analyst!=="Jenson")return false;
    if(filters.analyst==="Unassigned"&&d.analyst)return false;
    if(search&&!ticker.toLowerCase().includes(search.toLowerCase()))return false;
    return true;
  });
  const rows=sortCol?[...filteredRows].sort((a,b)=>{
    const da=data[a.ticker],db=data[b.ticker]; let va,vb;
    if(sortCol==="ticker"){va=a.ticker;vb=b.ticker;}
    else if(sortCol==="region"){va=a.region;vb=b.region;}
    else if(sortCol==="list"){va=a.list;vb=b.list;}
    else if(sortCol==="analyst"){va=da.analyst||"";vb=db.analyst||"";}
    else if(sortCol==="date"){va=da.researchDate||"";vb=db.researchDate||"";}
    else if(sortCol==="age"){va=daysSince(da.researchDate)??9999;vb=daysSince(db.researchDate)??9999;}
    else if(sortCol==="status"){va=da.status;vb=db.status;}
    else if(sortCol==="earnings"){va=da.earnings?1:0;vb=db.earnings?1:0;}
    else{va="";vb="";}
    if(va<vb)return sortDir==="asc"?-1:1; if(va>vb)return sortDir==="asc"?1:-1; return 0;
  }):filteredRows;

  const total=ALL_TICKERS.length;
  const covered=ALL_TICKERS.filter(({ticker})=>data[ticker].researchDate).length;
  const fresh=ALL_TICKERS.filter(({ticker})=>{ const d=daysSince(data[ticker].researchDate); return d!==null&&d<=30; }).length;
  const stale=ALL_TICKERS.filter(({ticker})=>{ const d=daysSince(data[ticker].researchDate); return d!==null&&d>30; }).length;
  const notStarted=ALL_TICKERS.filter(({ticker})=>!data[ticker].researchDate).length;

  const navStyle=p=>({background:page===p?S2:"transparent",border:`0.5px solid ${page===p?BDR2:"transparent"}`,borderRadius:6,padding:"5px 16px",cursor:"pointer",fontWeight:page===p?500:400,fontSize:13,color:page===p?TXT:TXT2,transition:"all 0.15s"});
  const tabStyle=t=>({background:tab===t?S2:"transparent",border:`0.5px solid ${tab===t?BDR2:"transparent"}`,borderRadius:6,padding:"4px 14px",cursor:"pointer",fontWeight:tab===t?500:400,fontSize:12,color:tab===t?TXT:TXT2});
  const filterStyle=active=>({background:active?"rgba(55,138,221,0.15)":"transparent",border:`0.5px solid ${active?"rgba(55,138,221,0.4)":BDR}`,borderRadius:5,padding:"3px 10px",cursor:"pointer",fontSize:11,color:active?"#72b3f5":TXT2});
  const inputStyle={fontSize:12,padding:"4px 8px",borderRadius:5,border:`0.5px solid ${BDR2}`,background:S1,color:TXT,outline:"none"};
  const thStyle={textAlign:"left",padding:"6px 8px",fontWeight:500,color:TXT3,fontSize:11,borderBottom:`0.5px solid ${BDR2}`,whiteSpace:"nowrap"};
  const tdStyle={padding:"6px 8px",borderBottom:`0.5px solid ${BDR}`,verticalAlign:"middle"};

  return (
    <div style={{background:BG,minHeight:"100vh",padding:"16px",fontFamily:"system-ui,sans-serif",color:TXT,fontSize:13}}>
      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:16,paddingBottom:12,borderBottom:`0.5px solid ${BDR2}`,flexWrap:"wrap"}}>
        <span style={{fontSize:15,fontWeight:500,color:TXT,marginRight:8}}>Research Suite</span>
        {["Coverage","Tools Choice","Use Cases","To Do","Flow"].map(p=>(
          <button key={p} onClick={()=>setPage(p)} style={navStyle(p)}>{p}</button>
        ))}
        <span style={{flex:1}}/>
        <span style={{fontSize:11,color:TXT3}}>{saving?"Saving…":saveMsg}</span>
      </div>

      {page==="Coverage"&&(
        <>
          <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:12,flexWrap:"wrap"}}>
            <span style={{fontSize:14,fontWeight:500}}>{total} tickers</span>
            <span style={{fontSize:11,color:TXT2}}>· {covered} researched · {fresh} fresh</span>
            <span style={{flex:1}}/>
            <Btn onClick={exportCSV}>Export CSV ↓</Btn>
            <label style={{fontSize:12,padding:"4px 12px",borderRadius:6,border:`0.5px solid ${BDR2}`,cursor:"pointer",color:TXT}}>
              Import CSV ↑<input type="file" accept=".csv" onChange={importCSV} style={{display:"none"}}/>
            </label>
            {importErr&&<span style={{fontSize:11,color:"#f07070"}}>{importErr}</span>}
          </div>
          {pendingExport&&<ExportBanner onExport={exportCSV} label="Coverage"/>}
          <div style={{display:"flex",gap:4,marginBottom:12}}>
            {["Universe","Progress","AI Brief"].map(t=>(<button key={t} onClick={()=>setTab(t)} style={tabStyle(t)}>{t}</button>))}
          </div>

          {tab==="Universe"&&(
            <>
              <div style={{display:"flex",gap:6,marginBottom:10,flexWrap:"wrap",alignItems:"center"}}>
                <span style={{fontSize:11,color:TXT3,marginRight:2}}>List</span>
                {["All","Portfolio","Watchlist"].map(f=>(<button key={f} onClick={()=>setFilters(p=>({...p,list:f}))} style={filterStyle(filters.list===f)}>{f}</button>))}
                <span style={{fontSize:11,color:TXT3,marginLeft:8,marginRight:2}}>Region</span>
                {["All","US","HK"].map(f=>(<button key={f} onClick={()=>setFilters(p=>({...p,region:f}))} style={filterStyle(filters.region===f)}>{f}</button>))}
                <span style={{fontSize:11,color:TXT3,marginLeft:8,marginRight:2}}>Analyst</span>
                {["All","Jenson","Unassigned"].map(f=>(<button key={f} onClick={()=>setFilters(p=>({...p,analyst:f}))} style={filterStyle(filters.analyst===f)}>{f}</button>))}
                <input placeholder="Search ticker…" value={search} onChange={e=>setSearch(e.target.value)} style={{...inputStyle,marginLeft:"auto",width:120}}/>
              </div>
              <div style={{overflowX:"auto",borderRadius:8,border:`0.5px solid ${BDR2}`}}>
                <table style={{width:"100%",borderCollapse:"collapse",fontSize:12,tableLayout:"fixed",minWidth:700}}>
                  <colgroup><col style={{width:82}}/><col style={{width:44}}/><col style={{width:66}}/><col style={{width:70}}/><col style={{width:106}}/><col style={{width:50}}/><col style={{width:78}}/><col style={{width:52}}/><col style={{width:"auto"}}/><col style={{width:68}}/></colgroup>
                  <thead style={{background:S2}}>
                    <tr>{[["Ticker","ticker"],["Rgn","region"],["List","list"],["Analyst","analyst"],["Knowledge as of","date"],["Age","age"],["Status","status"],["Earnings","earnings"],["Notes",null],["",null]].map(([h,col])=>(
                      <th key={h} style={{...thStyle,cursor:col?"pointer":"default",userSelect:"none"}} onClick={()=>col&&toggleSort(col)}>{h}{col&&<span style={{opacity:0.4,fontSize:10}}>{sortIcon(col)}</span>}</th>
                    ))}</tr>
                  </thead>
                  <tbody>
                    {rows.map(({ticker,region,list})=>{
                      const d=data[ticker]; const days=daysSince(d.researchDate); const fc=fStyle(days); const sc=sStyle(d.status); const isEdit=editing===ticker;
                      return (
                        <tr key={ticker} style={{background:"transparent"}} onMouseEnter={e=>e.currentTarget.style.background=S1} onMouseLeave={e=>e.currentTarget.style.background="transparent"}>
                          <td style={{...tdStyle,fontWeight:500,color:TXT}}>{ticker}</td>
                          <td style={{...tdStyle,color:TXT2}}>{region}</td>
                          <td style={{...tdStyle,color:TXT2}}>{list}</td>
                          <td style={tdStyle}>{isEdit?<input value={editVal.analyst} onChange={e=>setEditVal(v=>({...v,analyst:e.target.value}))} style={{...inputStyle,width:"90%",fontSize:11}}/>:<span style={{color:TXT}}>{d.analyst||"—"}</span>}</td>
                          <td style={tdStyle}>{isEdit?<div style={{display:"flex",gap:3,alignItems:"center"}}><input type="date" value={editVal.researchDate} onChange={e=>setEditVal(v=>({...v,researchDate:e.target.value}))} style={{...inputStyle,width:102,fontSize:11}}/><button onClick={()=>setEditVal(v=>({...v,researchDate:today}))} style={{fontSize:10,padding:"2px 5px",borderRadius:4,border:`0.5px solid ${BDR}`,background:"transparent",cursor:"pointer",color:TXT2}}>Today</button></div>:<span style={{color:d.researchDate?TXT:TXT3}}>{d.researchDate||"—"}</span>}</td>
                          <td style={tdStyle}><Pill bg={fc.bg} text={fc.text} label={fc.label}/></td>
                          <td style={tdStyle}>{isEdit?<select value={editVal.status} onChange={e=>setEditVal(v=>({...v,status:e.target.value}))} style={{...inputStyle,padding:"2px 4px"}}>{STATUS_OPTIONS.map(s=><option key={s}>{s}</option>)}</select>:<Pill bg={sc.bg} text={sc.text} label={d.status}/>}</td>
                          <td style={{...tdStyle,textAlign:"center"}}><input type="checkbox" checked={isEdit?editVal.earnings:d.earnings} onChange={e=>{ if(isEdit)setEditVal(v=>({...v,earnings:e.target.checked})); else applyData({...data,[ticker]:{...d,earnings:e.target.checked}}); }} style={{cursor:"pointer",accentColor:"#378ADD",width:13,height:13}}/></td>
                          <td style={tdStyle}>{isEdit?<input value={editVal.notes} onChange={e=>setEditVal(v=>({...v,notes:e.target.value}))} style={{...inputStyle,width:"95%",fontSize:11}}/>:<span style={{color:d.notes?TXT:TXT3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",display:"block",maxWidth:170}}>{d.notes||"—"}</span>}</td>
                          <td style={tdStyle}>{isEdit?<Btn onClick={()=>saveEdit(ticker)} style={{color:"#72b3f5"}}>Save</Btn>:<Btn onClick={()=>startEdit(ticker)}>Edit</Btn>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab==="Progress"&&(
            <>
              <div style={{display:"grid",gridTemplateColumns:"repeat(4,minmax(0,1fr))",gap:10,marginBottom:20}}>
                {[{label:"Total",value:total,bg:S2,text:TXT},{label:"Fresh (≤30d)",value:fresh,bg:"rgba(99,153,34,0.15)",text:"#a3d060"},{label:"Stale (>30d)",value:stale,bg:"rgba(186,117,23,0.15)",text:"#f0b84a"},{label:"Not started",value:notStarted,bg:"rgba(226,75,74,0.15)",text:"#f07070"}].map(c=>(
                  <div key={c.label} style={{background:c.bg,borderRadius:8,padding:"12px 14px",border:`0.5px solid ${BDR}`}}>
                    <div style={{fontSize:11,color:c.text,opacity:0.7,marginBottom:4}}>{c.label}</div>
                    <div style={{fontSize:26,fontWeight:500,color:c.text}}>{c.value}</div>
                  </div>
                ))}
              </div>
              <div style={{marginBottom:20}}>
                <div style={{display:"flex",justifyContent:"space-between",fontSize:12,color:TXT2,marginBottom:5}}><span>Coverage progress</span><span>{covered}/{total} — {Math.round(covered/total*100)}%</span></div>
                <div style={{height:6,background:S2,borderRadius:3,overflow:"hidden"}}><div style={{height:"100%",width:`${covered/total*100}%`,background:"#639922",borderRadius:3,transition:"width 0.4s"}}/></div>
              </div>
              <div style={{fontSize:11,fontWeight:500,marginBottom:8,color:TXT3,textTransform:"uppercase",letterSpacing:"0.05em"}}>Staleness — worst to best</div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:6}}>
                {[...ALL_TICKERS].sort((a,b)=>{ const da=daysSince(data[a.ticker].researchDate),db=daysSince(data[b.ticker].researchDate); if(da===null&&db===null)return 0; if(da===null)return -1; if(db===null)return 1; return db-da; }).map(({ticker})=>{
                  const d=data[ticker]; const days=daysSince(d.researchDate); const fc=fStyle(days);
                  return (
                    <div key={ticker} style={{background:fc.bg,border:`0.5px solid ${BDR}`,borderRadius:7,padding:"8px 10px",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                      <div><div style={{fontWeight:500,fontSize:12,color:fc.text}}>{ticker}</div><div style={{fontSize:10,color:fc.text,opacity:0.6}}>{d.researchDate||"not set"}</div></div>
                      <div style={{fontSize:11,fontWeight:500,color:fc.text}}>{fc.label}</div>
                    </div>
                  );
                })}
              </div>
            </>
          )}

          {tab==="AI Brief"&&(
            <div>
              <div style={{fontSize:12,color:TXT2,marginBottom:12}}>Live research brief via web search. Allow 10–20s.</div>
              <div style={{display:"flex",gap:8,marginBottom:14,flexWrap:"wrap",alignItems:"center"}}>
                <input placeholder="Ticker (e.g. NVDA)" value={aiTicker} onChange={e=>setAiTicker(e.target.value.toUpperCase())} onKeyDown={e=>e.key==="Enter"&&runAI()} style={{...inputStyle,width:150}}/>
                <Btn onClick={runAI} disabled={aiLoading||!aiTicker}>{aiLoading?"Searching…":"Generate ↗"}</Btn>
                {aiLoading&&<span style={{fontSize:11,color:TXT3}}>Running web search…</span>}
              </div>
              {aiResult&&(
                <div style={{background:S1,borderRadius:8,border:`0.5px solid ${BDR2}`,padding:"14px 16px"}}>
                  <div style={{fontSize:12,fontWeight:500,marginBottom:8,color:"#72b3f5"}}>{aiTicker} — research brief</div>
                  <div style={{fontSize:12,lineHeight:1.75,color:TXT,whiteSpace:"pre-wrap"}}>{aiResult}</div>
                  <div style={{marginTop:10,fontSize:10,color:TXT3}}>Generated {new Date().toLocaleString()}</div>
                </div>
              )}
            </div>
          )}
        </>
      )}

      {page==="Tools Choice"&&<AIAdoptionPage/>}
      {page==="Use Cases"&&<UseCasesPage/>}
      {page==="To Do"&&<ToDoPage/>}
      {page==="Flow"&&<FlowPage/>}
    </div>
  );
}
