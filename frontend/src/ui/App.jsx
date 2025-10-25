import React, { useEffect, useMemo, useRef, useState } from "react";
import { ethers } from "ethers";
import addresses from "../contract-addresses.json";
import Bunnies from "./Bunnies";
import LimboAbi from "../abi/LimboMain.json";
import ERC20Abi from "../abi/ERC20.json";

const CHAIN_ID_HEX = (addresses.chainIdHex || "0x2328").toLowerCase();

const IMG_BUNNY = "https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f430.png";
const IMG_CARROT = "https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/1f955.png";
const IMG_HEART  = "https://raw.githubusercontent.com/twitter/twemoji/master/assets/72x72/2764.png";
const IMAGES = [IMG_BUNNY, IMG_CARROT, IMG_HEART];

// utils
const toWei   = (x) => ethers.utils.parseEther(String(x));
const fromWei = (bn) => ethers.utils.formatEther(bn);
const clamp6  = (n) => Number(n).toFixed(6);
const DUST_WEI = ethers.BigNumber.from(1);
const BUFFER_PPM = 500; // 0.05%

function isValidAmount(v){
  if(v===undefined || v===null || v==="") return false;
  const n = Number(v);
  if(!isFinite(n) || n<=0) return false;
  try { toWei(v); return true; } catch { return false; }
}

// toast
function useToast(){
  const [toasts,setToasts]=useState([]);
  const push=(type,msg)=>setToasts(t=>[...t,{id:Date.now()+Math.random(),type,msg}]);
  const remove=(id)=>setToasts(t=>t.filter(x=>x.id!==id));
  return {toasts,push,remove};
}

async function addOrSwitchNetwork(ethereum){
  try{
    await ethereum.request({ method:"wallet_switchEthereumChain", params:[{chainId:CHAIN_ID_HEX}] });
  }catch(e){
    if(e.code===4902){
      await ethereum.request({
        method:"wallet_addEthereumChain",
        params:[{
          chainId:CHAIN_ID_HEX,
          chainName:addresses.chainName || "Zama Devnet",
          nativeCurrency:{ name:"ZAMA", symbol:"ZAMA", decimals:18 },
          rpcUrls:[addresses.rpcUrl || "https://devnet.zama.ai"],
          blockExplorerUrls: addresses.explorer ? [addresses.explorer] : [],
        }]
      });
    } else { throw e; }
  }
}

export default function App(){
  const [signer,setSigner]=useState(null);
  const [address,setAddress]=useState("");
  const [busy,setBusy]=useState(false);
  const [dark,setDark]=useState(()=>localStorage.getItem("limbo-dark")==="1");
  const [burst,setBurst]=useState(0);

  const [balances,setBalances]=useState({eth:"0",leth:"0",debt:"0",avail:"0"});
  const [dep,setDep]=useState("");
  const [wd,setWd]=useState("");
  const [brw,setBrw]=useState("");
  const [rep,setRep]=useState("");

  const {toasts,push,remove}=useToast();

  // theme
  useEffect(()=>{
    document.documentElement.classList.toggle("dark",dark);
    localStorage.setItem("limbo-dark",dark?"1":"0");
  },[dark]);

  const hasAddresses = Boolean(addresses?.LIMBO && addresses?.LETH && addresses?.LUSDT);
  const limbo = useMemo(()=> signer && hasAddresses? new ethers.Contract(addresses.LIMBO,LimboAbi,signer) : null,[signer,hasAddresses]);
  const leth  = useMemo(()=> signer && hasAddresses? new ethers.Contract(addresses.LETH, ERC20Abi,signer) : null,[signer,hasAddresses]);
  const lusdt = useMemo(()=> signer && hasAddresses? new ethers.Contract(addresses.LUSDT,ERC20Abi,signer) : null,[signer,hasAddresses]);

  // net status
  const [netOk,setNetOk]=useState(false);
  useEffect(()=>{ (async()=>{
    if(!signer){ setNetOk(false); return; }
    try{
      const net=await signer.provider.getNetwork();
      const got=("0x"+net.chainId.toString(16)).toLowerCase();
      setNetOk(got===CHAIN_ID_HEX);
    }catch{ setNetOk(false); }
  })(); },[signer]);
  const ready = Boolean(signer && limbo && netOk && hasAddresses);

  // connect
  const providerRef = useRef(null);
  const connect=async()=>{
    const {ethereum}=window;
    if(!ethereum) return alert("Install MetaMask or Rabby");
    const p=new ethers.providers.Web3Provider(ethereum,"any");
    providerRef.current = p;
    await p.send("eth_requestAccounts",[]);
    const s=p.getSigner();
    setSigner(s);
    setAddress(await s.getAddress());
    await addOrSwitchNetwork(ethereum);
    await refresh(); // сразу загрузить баланс/метрики

    // ловим смены аккаунта/сети и обновляемся
    ethereum.removeAllListeners?.("accountsChanged");
    ethereum.removeAllListeners?.("chainChanged");
    ethereum.on?.("accountsChanged", async (accs)=>{
      if(!accs?.length){ setSigner(null); setAddress(""); return; }
      const ns=p.getSigner();
      setSigner(ns); setAddress(await ns.getAddress()); await refresh();
    });
    ethereum.on?.("chainChanged", async ()=>{
      await addOrSwitchNetwork(ethereum);
      await refresh();
    });
  };

  // refresh
  const refresh=async()=>{
    if(!signer||!limbo) return;
    try{
      const [eth,le,db,av]=await Promise.all([
        signer.getBalance(),
        leth.balanceOf(address),
        limbo.getCurrentDebt(address),
        limbo.getAvailableToBorrow(address),
      ]);
      setBalances({
        eth:fromWei(eth),
        leth:fromWei(le),
        debt:fromWei(db),
        avail:fromWei(av),
      });
    }catch(e){ console.error(e); }
  };
  useEffect(()=>{ if(signer) refresh() },[signer]);

  // авто-обновление раз в 3 секунды при готовности
  const poller = useRef(null);
  useEffect(()=>{
    if(ready){
      poller.current && clearInterval(poller.current);
      poller.current = setInterval(refresh, 3000);
      return ()=> clearInterval(poller.current);
    } else {
      poller.current && clearInterval(poller.current);
    }
  },[ready]); // eslint-disable-line

  // safe Max withdraw (BN)
  const setMaxWithdrawSafe = async () => {
    if(!ready) return;
    try{
      const [collBN, debtBN] = await Promise.all([
        leth.balanceOf(address),
        limbo.getCurrentDebt(address),
      ]);
      const WEI = ethers.constants.WeiPerEther;
      let req = debtBN.mul(WEI).mul(100).div(75).div(ethers.utils.parseEther("5000"));
      let max = collBN.gt(req) ? collBN.sub(req) : ethers.BigNumber.from(0);
      if (max.gt(0)) {
        max = max.mul(1_000_000 - 500).div(1_000_000);
        if (max.gt(0)) max = max.sub(DUST_WEI);
      }
      setWd(fromWei(max));
    }catch(e){ console.error(e); }
  };

  // tx wrapper
  const doTx = async (name, fnStatic, fnSend) => {
    if(!ready){ alert("Connect wallet and check network/contracts."); return; }
    setBusy(true);
    try{
      if (fnStatic) await fnStatic();
      let gasLimit;
      try{
        gasLimit = await fnSend(true);
        gasLimit = gasLimit.mul(120).div(100);
      }catch{
        gasLimit = ethers.BigNumber.from(400000);
      }
      const tx = await fnSend(false, gasLimit);
      push("success", `${name} sent. Waiting...`);
      await tx.wait();
      push("success", `${name} confirmed`);
      await refresh();
    }catch(e){
      console.error(e);
      const msg = e?.error?.message || e?.data?.message || e?.reason || e?.message || "Transaction failed";
      push("error", msg);
      alert(msg);
    }finally{
      setBusy(false);
    }
  };

  return (
    <div className={`page ${dark?"theme-dark":""}`}>
      <Bunnies count={70} images={IMAGES} burstNonce={burst} dark={dark} />

      <div className="header">
        <div className="brand" onClick={()=>setBurst(n=>n+1)} title="Boing!"
             style={{display:"flex",gap:10,alignItems:"center",cursor:"pointer"}}>
          <img className="logo" alt="bunny" src={IMG_BUNNY}/>
          <div><b>Limbo</b><div className="stat">Zama Devnet</div></div>
        </div>

        <div className="header-right">
          {netOk
            ? <span className="badge green">LIMBO ✓</span>
            : <span className="badge red">Wrong Network ✕</span>
          }
          <span className="badge gray">ETH {Number(balances.eth||0).toFixed(4)}</span>
          <button onClick={()=>setDark(d=>!d)} style={{background:dark?"#0ea5e9":"#111827",color:"#fff"}}>
            {dark?"Light":"Dark"}
          </button>
          <button onClick={connect}>
            {address ? `${address.slice(0,6)}...${address.slice(-4)}` : "Connect"}
          </button>
        </div>
      </div>

      <div className="container">
        <div className="card">
          <h1>DeFi with Bunnies</h1>
          <div className="stat">ETH > LETH - Borrow LUSDT - APR 5% - LTV 75% - 1 LETH = 5000 LUSDT</div>
          <div className="hr"></div>

          <div className="stat-row">
            <span>ETH:</span><b>{Number(balances.eth).toFixed(4)}</b>
          </div>
          <div className="stat-row">
            <span>LETH:</span><b>{Number(balances.leth).toFixed(4)}</b>
          </div>
          <div className="stat-row">
            <span>Borrow Limit:</span><b>{Number(balances.avail).toFixed(4)} LUSDT</b>
          </div>
          <div className="stat-row">
            <span>Borrowed:</span><b>{Number(balances.debt).toFixed(4)} LUSDT</b>
          </div>
        </div>

        <div className="card">
          <h2>Deposit ETH</h2>
          <input value={dep} onChange={e=>setDep(e.target.value)} placeholder="0.1"/>
          <div className="row">
            <button
              disabled={!ready || !isValidAmount(dep) || busy}
              onClick={()=>doTx(
                "Deposit",
                null,
                async (estimate=false, gasLimit)=>{
                  const value = toWei(dep).sub(DUST_WEI);
                  if(estimate) return limbo.estimateGas.deposit({value});
                  return limbo.deposit({value, gasLimit});
                }
              )}
            >Deposit</button>
          </div>
        </div>

        <div className="card">
          <h2>Withdraw ETH</h2>
          <input value={wd} onChange={e=>setWd(e.target.value)} placeholder="0.05"/>
          <div className="row">
            <button className="maxbtn" type="button" onClick={setMaxWithdrawSafe}>Max</button>
            <button
              disabled={!ready || !isValidAmount(wd) || busy}
              onClick={()=>doTx(
                "Withdraw",
                async()=>{ await limbo.callStatic.withdraw(toWei(wd).sub(DUST_WEI)); },
                async (estimate=false, gasLimit)=>{
                  const amt = toWei(wd).sub(DUST_WEI);
                  if(estimate) return limbo.estimateGas.withdraw(amt);
                  return limbo.withdraw(amt,{gasLimit});
                }
              )}
              style={{background:"#f43f5e",color:"#fff"}}
            >Withdraw</button>
          </div>
        </div>

        <div className="card">
          <h2>Borrow LUSDT</h2>
          <input value={brw} onChange={e=>setBrw(e.target.value)} placeholder="10"/>
          <div className="row">
            <button
              className="maxbtn"
              onClick={()=>setBrw(clamp6(Math.max(0, Number(balances.avail||0)*0.9995 - 0.000001)))}
            >Max</button>
            <button
              disabled={!ready || !isValidAmount(brw) || busy}
              onClick={()=>doTx(
                "Borrow",
                async()=>{ await limbo.callStatic.borrow(toWei(brw).sub(DUST_WEI)); },
                async (estimate=false, gasLimit)=>{
                  const amt = toWei(brw).sub(DUST_WEI);
                  if(estimate) return limbo.estimateGas.borrow(amt);
                  return limbo.borrow(amt,{gasLimit});
                }
              )}
            >Borrow</button>
          </div>
        </div>

        <div className="card">
          <h2>Repay LUSDT</h2>
          <input value={rep} onChange={e=>setRep(e.target.value)} placeholder="5"/>
          <div className="row">
            <button className="maxbtn" onClick={()=>setRep(clamp6(Math.max(0, Number(balances.debt||0) - 0.000001)))}>
              Max
            </button>
            <button
              disabled={!ready || !isValidAmount(rep) || busy}
              onClick={()=>doTx(
                "Repay",
                null,
                async (estimate=false, gasLimit)=>{
                  const amt = toWei(rep).sub(DUST_WEI);
                  const allowance = await lusdt.allowance(address, addresses.LIMBO);
                  if(allowance.lt(amt)){
                    const apTx = await lusdt.approve(addresses.LIMBO, amt);
                    await apTx.wait();
                  }
                  if(estimate) return limbo.estimateGas.repay(amt);
                  return limbo.repay(amt,{gasLimit});
                }
              )}
              style={{background:"#3b82f6",color:"#fff"}}
            >Repay</button>
          </div>
        </div>

        <div className="footer">Limbo - Demo</div>
      </div>

      {/* Toasts */}
      <div className="toasts">
        {toasts.map(t=>(
          <div key={t.id} className={`toast ${t.type}`}>
            {t.type==="success" ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M20 7L9 18l-5-5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 9v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
            )}
            <span>{t.msg}</span>
            <button className="toast-x" onClick={()=>remove(t.id)}>×</button>
          </div>
        ))}
      </div>
    </div>
  );
}
