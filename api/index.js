const https = require('https');

const API_FOOTBALL_KEY = '248d9b2694dae249625fb67dd1d8aebc';
const ODDS_API_KEY     = '0cc06dfe512e4a85192b5442502f9dc9';

const ODDS_SPORT = {
  39:'soccer_epl',                    40:'soccer_efl_champ',
  41:'soccer_england_league1',        42:'soccer_england_league2',
  135:'soccer_italy_serie_a',         140:'soccer_spain_la_liga',
  78:'soccer_germany_bundesliga',     61:'soccer_france_ligue_one',
  2:'soccer_uefa_champs_league',      3:'soccer_uefa_europa_league',
  45:'soccer_fa_cup',                 848:'soccer_uefa_europa_conference_league',
  88:'soccer_netherlands_eredivisie', 94:'soccer_portugal_primeira_liga',
  144:'soccer_belgium_first_div',     103:'soccer_norway_eliteserien',
  113:'soccer_sweden_allsvenskan',    119:'soccer_denmark_superliga',
  128:'soccer_saudi_arabia_pro_league',169:'soccer_spl',
  253:'soccer_usa_mls',               262:'soccer_mexico_ligamx',
  71:'soccer_brazil_campeonato',      239:'soccer_argentina_primera_division',
};

function fetchUrl(url, headers={}) {
  return new Promise((resolve,reject) => {
    const req = https.get(url,{headers},(res) => {
      let data='';
      res.on('data',chunk=>data+=chunk);
      res.on('end',()=>{
        try{resolve({status:res.statusCode,body:JSON.parse(data)});}
        catch(e){resolve({status:res.statusCode,body:null,raw:data.slice(0,300)});}
      });
    });
    req.on('error',reject);
    req.setTimeout(20000,()=>{req.destroy();reject(new Error('Timeout'));});
  });
}

function norm(s){return (s||'').toLowerCase().replace(/[^a-z0-9]/g,'');}

const ALIASES = {
  'athleticclub':'athleticbilbao','atleticomadrid':'atleticomadrid',
  'psg':'parissaintgermain','parissaintgermain':'parissaintgermain',
  'manchestercity':'manchestercity','manchesterunited':'manchesterunited',
  'newcastleunited':'newcastle','newcastle':'newcastle',
  'nottinghamforest':'nottmforest','nottmforest':'nottmforest',
  'brightonandhovealbion':'brighton','wolverhamptonwanderers':'wolves','wolves':'wolves',
  'westhamunited':'westham','westham':'westham',
  'tottenhamhotspur':'tottenham','tottenham':'tottenham',
  'leicestercity':'leicester','leedsunited':'leeds',
  'asvmonaco':'monaco','olympiquedemarseille':'marseille','olympiquelyonnais':'lyon',
  'staderennais':'rennes','rcstrasbourg':'strasbourg',
  'borussiadortmund':'borussiadortmund','bayernmunich':'bayernmunich','fcbayernmunchen':'bayernmunich',
  'rbleipzig':'rbleipzig','interfc':'inter','inter':'inter','internazionale':'inter',
  'acmilan':'acmilan','milan':'acmilan','juventusfc':'juventus','juventus':'juventus',
  'sscnapoli':'napoli','napoli':'napoli','asroma':'roma','roma':'roma',
  'realmadridcf':'realmadrid','realmadrid':'realmadrid',
  'fcbarcelona':'barcelona','barcelona':'barcelona',
};

function normTeam(s){const n=norm(s);return ALIASES[n]||n;}

function findOddsForMatch(oddsData,homeN,awayN){
  if(!oddsData?.length) return null;
  const hn=normTeam(homeN),an=normTeam(awayN);
  for(const ev of oddsData){
    const eh=normTeam(ev.home_team||''),ea=normTeam(ev.away_team||'');
    const hm=eh===hn||eh.includes(hn.slice(0,6))||hn.includes(eh.slice(0,6));
    const am=ea===an||ea.includes(an.slice(0,6))||an.includes(ea.slice(0,6));
    if(!hm||!am) continue;
    const o={_eventId:ev.id,_matchedAs:ev.home_team+' vs '+ev.away_team};
    for(const bm of ev.bookmakers||[]){
      for(const mkt of bm.markets||[]){
        if(mkt.key==='h2h'){
          for(const out of mkt.outcomes||[]){
            const on=norm(out.name);
            if(on===eh||on.includes(eh.slice(0,5))) o.home=out.price;
            else if(on===ea||on.includes(ea.slice(0,5))) o.away=out.price;
            else o.draw=out.price;
          }
        }
        if(mkt.key==='totals'){
          for(const out of mkt.outcomes||[]){
            if(out.name==='Over'&&out.point===0.5) o.over05=out.price;
            if(out.name==='Under'&&out.point===0.5) o.under05=out.price;
            if(out.name==='Over'&&out.point===1.5) o.over15=out.price;
            if(out.name==='Under'&&out.point===1.5) o.under15=out.price;
            if(out.name==='Over'&&out.point===2.5) o.over25=out.price;
            if(out.name==='Under'&&out.point===2.5) o.under25=out.price;
            if(out.name==='Over'&&out.point===3.5) o.over35=out.price;
            if(out.name==='Under'&&out.point===3.5) o.under35=out.price;
            if(out.name==='Over'&&out.point===4.5) o.over45=out.price;
          }
        }
      }
      if(Object.keys(o).length>4) break;
    }
    return o;
  }
  return null;
}

function gs(stat,...path){
  let v=stat;
  for(const k of path){if(v==null) return null;v=v[k];}
  return(v!==null&&v!==undefined)?v:null;
}
function pct(n,d){return d>0?(n/d)*100:null;}
function poisson(lambda,k){
  if(lambda<=0) return k===0?1:0;
  let p=Math.exp(-lambda);
  for(let i=0;i<k;i++) p*=lambda/(i+1);
  return p;
}
function goalProbs(lambda){
  const p={};
  for(let k=0;k<=10;k++) p[k]=poisson(lambda,k);
  p.under05=p[0];p.over05=1-p.under05;
  p.under15=p[0]+p[1];p.over15=1-p.under15;
  p.under25=p[0]+p[1]+p[2];p.over25=1-p.under25;
  p.under35=p[0]+p[1]+p[2]+p[3];p.over35=1-p.under35;
  p.under45=p[0]+p[1]+p[2]+p[3]+p[4];p.over45=1-p.under45;
  return p;
}
function implProb(odds){return odds?(1/odds)*100:null;}

function analyze(fixture,hStat,aStat,odds,leagueName){
  const home=fixture.teams.home.name,away=fixture.teams.away.name;
  const bets=[],warnings=[];

  const hGPh=gs(hStat,'fixtures','played','home')||0;
  const aGPa=gs(aStat,'fixtures','played','away')||0;
  const hGPt=gs(hStat,'fixtures','played','total')||hGPh||0;
  const aGPt=gs(aStat,'fixtures','played','total')||aGPa||0;
  if(hGPh<3) warnings.push(`${home} only ${hGPh} home games`);
  if(aGPa<3) warnings.push(`${away} only ${aGPa} away games`);

  const hGFh=gs(hStat,'goals','for','total','home')||0;
  const hGAh=gs(hStat,'goals','against','total','home')||0;
  const aGFa=gs(aStat,'goals','for','total','away')||0;
  const aGAa=gs(aStat,'goals','against','total','away')||0;

  const hAvgGFh=hGPh>0?hGFh/hGPh:null;
  const hAvgGAh=hGPh>0?hGAh/hGPh:null;
  const aAvgGFa=aGPa>0?aGFa/aGPa:null;
  const aAvgGAa=aGPa>0?aGAa/aGPa:null;

  if(hAvgGFh===null) warnings.push(`No goals data for ${home}`);
  if(aAvgGFa===null) warnings.push(`No goals data for ${away}`);

  const expHome=(hAvgGFh!==null&&aAvgGAa!==null)?(hAvgGFh+aAvgGAa)/2:null;
  const expAway=(aAvgGFa!==null&&hAvgGAh!==null)?(aAvgGFa+hAvgGAh)/2:null;
  const expTotal=(expHome!==null&&expAway!==null)?expHome+expAway:null;
  if(expTotal===null) warnings.push('Cannot calculate expected goals');

  const hCSh=gs(hStat,'clean_sheet','home')||0;
  const aCSa=gs(aStat,'clean_sheet','away')||0;
  const hCSPct=pct(hCSh,hGPh),aCSPct=pct(aCSa,aGPa);
  const hFTSh=gs(hStat,'failed_to_score','home')||0;
  const aFTSa=gs(aStat,'failed_to_score','away')||0;
  const hFTSPct=pct(hFTSh,hGPh)||18,aFTSPct=pct(aFTSa,aGPa)||22;

  const hWh=gs(hStat,'fixtures','wins','home')||0,aWa=gs(aStat,'fixtures','wins','away')||0;
  const hDh=gs(hStat,'fixtures','draws','home')||0,aDa=gs(aStat,'fixtures','draws','away')||0;
  const hWPct=pct(hWh,hGPh),aWPct=pct(aWa,aGPa);
  const hDPct=pct(hDh,hGPh),aDPct=pct(aDa,aGPa);

  const pHS=expHome!==null?1-poisson(expHome,0):(1-hFTSPct/100);
  const pAS=expAway!==null?1-poisson(expAway,0):(1-aFTSPct/100);
  const bttsPct=pHS*pAS*100;

  function addBet(market,category,betOdds,dataProb,reasoning){
    const impl=betOdds?implProb(betOdds):null;
    const edge=impl!==null?dataProb-impl:null;
    if(edge!==null&&edge<=0) return;
    if(edge===null&&dataProb<58) return;
    bets.push({market,category,odds:betOdds,dataProb:Math.round(dataProb),impliedProb:impl,edge,reasoning});
  }

  if(expTotal!==null){
    const tp=goalProbs(expTotal);
    const r=`Poisson: exp ${expTotal.toFixed(2)} goals`;
    addBet('Over 0.5 Goals','Goals',odds?.over05,tp.over05*100,r);
    addBet('Under 1.5 Goals','Goals',odds?.under15,tp.under15*100,r);
    addBet('Over 1.5 Goals','Goals',odds?.over15,tp.over15*100,r);
    addBet('Under 2.5 Goals','Goals',odds?.under25,tp.under25*100,r);
    addBet('Over 2.5 Goals','Goals',odds?.over25,tp.over25*100,r);
    addBet('Under 3.5 Goals','Goals',odds?.under35,tp.under35*100,r);
    addBet('Over 3.5 Goals','Goals',odds?.over35,tp.over35*100,r);
    addBet('Over 4.5 Goals','Goals',odds?.over45,tp.over45*100,r);
  }

  if(hGPh>=4&&aGPa>=4){
    addBet('BTTS Yes','BTTS',odds?.bttsYes,bttsPct,`Home scores ${(pHS*100).toFixed(0)}% | Away scores ${(pAS*100).toFixed(0)}%`);
    addBet('BTTS No','BTTS',odds?.bttsNo,100-bttsPct,`Home CS ${hCSPct?.toFixed(0)||'?'}% | Away FTS ${aFTSPct.toFixed(0)}%`);
  }

  if(hWPct!==null&&aWPct!==null){
    const drawPct=(hDPct+aDPct)/2,tot=hWPct+aWPct+drawPct;
    addBet(`${home} Win`,'Result',odds?.home,(hWPct/tot)*100,`Home win ${hWPct.toFixed(0)}% this season`);
    addBet('Draw','Result',odds?.draw,(drawPct/tot)*100,`Draw ${hDPct.toFixed(0)}% home | ${aDPct.toFixed(0)}% away`);
    addBet(`${away} Win`,'Result',odds?.away,(aWPct/tot)*100,`Away win ${aWPct.toFixed(0)}% this season`);
    if(hGPh>=4&&aGPa>=4){
      const dnbH=(hWPct/(hWPct+aWPct))*100,dnbA=(aWPct/(hWPct+aWPct))*100;
      addBet(`${home} DNB`,'Result',odds?.dnbHome,dnbH,`Home win ${hWPct.toFixed(0)}% | Draw refunded`);
      addBet(`${away} DNB`,'Result',odds?.dnbAway,dnbA,`Away win ${aWPct.toFixed(0)}% | Draw refunded`);
      const tot2=tot;
      addBet(`${home} or Draw`,'Result',odds?.dc1x,((hWPct+(hDPct+aDPct)/2)/tot2)*100,`Home or draw`);
      addBet(`${away} or Draw`,'Result',odds?.dcx2,((aWPct+(hDPct+aDPct)/2)/tot2)*100,`Away or draw`);
      addBet('Home or Away','Result',odds?.dc12,((hWPct+aWPct)/tot2)*100,`Either team wins`);
    }
  }

  if(aCSPct!==null&&aCSPct>=35&&hAvgGFh!==null&&hAvgGFh<1.2)
    addBet('Under 1.5 Goals','Goals',odds?.under15,Math.max(55,aCSPct*0.6+(100-hFTSPct)*0.4),`Away CS ${aCSPct.toFixed(0)}% + low-scoring home`);
  if(hAvgGFh!==null&&aAvgGAa!==null&&hAvgGFh>1.8&&aAvgGAa>1.5)
    addBet('Over 2.5 Goals','Goals',odds?.over25,Math.min(78,50+(hAvgGFh-1)*10+(aAvgGAa-1)*8),`Prolific home ${hAvgGFh.toFixed(2)}/g vs leaky away`);
  if(hFTSPct>=30&&aFTSPct>=30)
    addBet('BTTS No','BTTS',odds?.bttsNo,Math.min(72,(hFTSPct+aFTSPct)/2+20),`Home FTS ${hFTSPct.toFixed(0)}% + Away FTS ${aFTSPct.toFixed(0)}%`);

  if(expTotal!==null){
    const expC=expTotal*4.2+1.8;
    if(expC>10.5) addBet('Over 9.5 Corners','Corners',null,Math.min(65,50+(expC-9.5)*5),`Est ${expC.toFixed(1)} corners`);
    if(expC>9.5)  addBet('Over 8.5 Corners','Corners',null,Math.min(68,50+(expC-8.5)*6),`Est ${expC.toFixed(1)} corners`);
    if(expC<8.5)  addBet('Under 8.5 Corners','Corners',null,Math.min(65,50+(8.5-expC)*5),`Est ${expC.toFixed(1)} corners`);
  }

  if(expTotal!==null&&expTotal<2.1)
    addBet('0-0 Half Time','Half Time',null,Math.min(58,(1-expTotal/2.5)*75),`Low expected total ${expTotal.toFixed(2)}`);
  if(hWPct!==null&&hWPct>=60)
    addBet(`${home} HT Lead`,'Half Time',null,Math.min(55,hWPct*0.72),`Home win ${hWPct.toFixed(0)}% — expected early control`);

  const seen={},unique=[];
  for(const b of bets){if(!seen[b.market]||(b.edge||0)>(seen[b.market].edge||0)) seen[b.market]=b;}
  for(const b of Object.values(seen)) unique.push(b);
  unique.sort((a,b)=>(b.edge||0)-(a.edge||0));

  return{
    fixture:{id:fixture.fixture.id,date:fixture.fixture.date,home:fixture.teams.home.name,away:fixture.teams.away.name,status:fixture.fixture.status.short},
    league:leagueName,odds,expHome,expAway,expTotal,bets:unique,
    diag:{
      home,away,homeGP:hGPt,awayGP:aGPt,
      homeStatsFound:!!hStat,awayStatsFound:!!aStat,oddsFound:!!odds,
      matchedEvent:odds?._matchedAs||null,
      oddsAvailable:odds?Object.keys(odds).filter(k=>!k.startsWith('_')):[],
      homeGFpg:hAvgGFh?.toFixed(2),homeGApg:hAvgGAh?.toFixed(2),
      awayGFpg:aAvgGFa?.toFixed(2),awayGApg:aAvgGAa?.toFixed(2),
      expHome:expHome?.toFixed(2),expAway:expAway?.toFixed(2),expTotal:expTotal?.toFixed(2),
      bttsPct:bttsPct.toFixed(1),homeCSPct:hCSPct?.toFixed(1),awayCSPct:aCSPct?.toFixed(1),
      homeWinPct:hWPct?.toFixed(1),awayWinPct:aWPct?.toFixed(1),
      bets:unique.map(b=>({market:b.market,dataProb:b.dataProb,impl:b.impliedProb?.toFixed(1),edge:b.edge?.toFixed(1),hasOdds:!!b.odds})),
      warnings,
    }
  };
}

module.exports=async(req,res)=>{
  res.setHeader('Access-Control-Allow-Origin','*');
  res.setHeader('Access-Control-Allow-Headers','Content-Type');
  res.setHeader('Content-Type','application/json');
  if(req.method==='OPTIONS'){res.status(200).end();return;}
  const params=req.query||{};
  const type=params.type;

  try{
    if(type==='leagues'){
      const fr=await fetchUrl('https://v3.football.api-sports.io/leagues?current=true&type=League',{'x-apisports-key':API_FOOTBALL_KEY});
      if(!fr.body){res.status(502).json({error:'Leagues fetch failed'});return;}
      const leagues=(fr.body.response||[]).map(l=>({id:l.league.id,name:l.league.name,country:l.country.name,season:l.seasons[0]?.year}));
      res.status(200).json(leagues);return;
    }

    if(type==='analyse'){
      const{league,season,date,leagueName}=params;
      const sportKey=ODDS_SPORT[parseInt(league)];
      const fixRes=await fetchUrl(`https://v3.football.api-sports.io/fixtures?date=${date}&league=${league}&season=${season}`,{'x-apisports-key':API_FOOTBALL_KEY});
      if(!fixRes.body){res.status(502).json({error:'Fixtures fetch failed'});return;}
      const fixtures=(fixRes.body.response||[]).filter(f=>['NS','TBD','1H','HT','2H','ET','BT','P','LIVE'].includes(f.fixture.status.short));
      if(!fixtures.length){res.status(200).json({results:[],diag:'No upcoming fixtures today'});return;}
      let oddsData=[];
      if(sportKey){
        const oddsRes=await fetchUrl(`https://api.the-odds-api.com/v4/sports/${sportKey}/odds/?apiKey=${ODDS_API_KEY}&regions=uk&markets=h2h,totals&oddsFormat=decimal&dateFormat=iso`);
        if(oddsRes.body&&Array.isArray(oddsRes.body)) oddsData=oddsRes.body;
      }
      const results=[];
      for(const fx of fixtures){
        const[hStatRes,aStatRes]=await Promise.all([
          fetchUrl(`https://v3.football.api-sports.io/teams/statistics?league=${league}&season=${season}&team=${fx.teams.home.id}`,{'x-apisports-key':API_FOOTBALL_KEY}),
          fetchUrl(`https://v3.football.api-sports.io/teams/statistics?league=${league}&season=${season}&team=${fx.teams.away.id}`,{'x-apisports-key':API_FOOTBALL_KEY}),
        ]);
        const hStat=hStatRes.body?.response||null;
        const aStat=aStatRes.body?.response||null;
        let odds=findOddsForMatch(oddsData,fx.teams.home.name,fx.teams.away.name);
        if(odds?._eventId&&sportKey){
          try{
            const evRes=await fetchUrl(`https://api.the-odds-api.com/v4/sports/${sportKey}/events/${odds._eventId}/odds?apiKey=${ODDS_API_KEY}&regions=uk&markets=btts,draw_no_bet,double_chance&oddsFormat=decimal`);
            if(evRes.body?.bookmakers){
              for(const bm of evRes.body.bookmakers){
                for(const mkt of bm.markets||[]){
                  if(mkt.key==='btts'){for(const out of mkt.outcomes||[]){if(out.name==='Yes'&&!odds.bttsYes)odds.bttsYes=out.price;if(out.name==='No'&&!odds.bttsNo)odds.bttsNo=out.price;}}
                  if(mkt.key==='draw_no_bet'){for(const out of mkt.outcomes||[]){const on=norm(out.name),hn=norm(fx.teams.home.name),an=norm(fx.teams.away.name);if((on===hn||hn.includes(on.slice(0,6))||on.includes(hn.slice(0,6)))&&!odds.dnbHome)odds.dnbHome=out.price;if((on===an||an.includes(on.slice(0,6))||on.includes(an.slice(0,6)))&&!odds.dnbAway)odds.dnbAway=out.price;}}
                  if(mkt.key==='double_chance'){for(const out of mkt.outcomes||[]){if(out.name==='Home/Draw'&&!odds.dc1x)odds.dc1x=out.price;if(out.name==='Away/Draw'&&!odds.dcx2)odds.dcx2=out.price;if(out.name==='Home/Away'&&!odds.dc12)odds.dc12=out.price;}}
                }
                if(odds.bttsYes&&odds.dnbHome&&odds.dc1x) break;
              }
            }
          }catch(e){}
        }
        results.push(analyze(fx,hStat,aStat,odds,leagueName||''));
      }
      res.status(200).json({results});return;
    }

    if(type==='odds'){
      const{sport}=params;
      const fr=await fetchUrl(`https://api.the-odds-api.com/v4/sports/${sport}/odds/?apiKey=${ODDS_API_KEY}&regions=uk&markets=h2h&oddsFormat=decimal&dateFormat=iso`);
      const teams=(fr.body||[]).map(e=>({home:e.home_team,away:e.away_team,id:e.id}));
      res.status(200).json(teams);return;
    }

    if(type==='debug'){
      const{league,season,team}=params;
      const fr=await fetchUrl(`https://v3.football.api-sports.io/teams/statistics?league=${league}&season=${season}&team=${team}`,{'x-apisports-key':API_FOOTBALL_KEY});
      res.status(200).json(fr.body?.response||fr.body);return;
    }

    res.status(400).json({error:'Unknown type'});return;
  }catch(e){
    res.status(500).json({error:e.message});return;
  }
};
