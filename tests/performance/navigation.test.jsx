import { Suspense, useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({push:vi.fn(),replace:vi.fn(),refresh:vi.fn()}));
vi.mock('next/navigation',()=>({useRouter:()=>state}));
vi.mock('@/components/ui/interviewos-loader',()=>({InterviewOSInlineLoader:({message})=><span role="status">{message}</span>}));
import { NavigationProvider, RouteFeedback, useRouter } from '@/components/navigation/provider';
afterEach(()=>{cleanup();vi.clearAllMocks();vi.useRealTimers();});
it('keeps the current page visible while a transition suspends, then removes feedback immediately',async()=>{
  let ready=false,release;
  const waiting=new Promise(resolve=>{release=()=>{ready=true;resolve();};});
  function Page({next}) {if(next&&!ready)throw waiting;return <h1>{next?'Candidates':'Dashboard'}</h1>;}
  function Fixture(){const [next,setNext]=useState(false);state.push.mockImplementation(()=>setNext(true));const router=useRouter();return <><button onClick={()=>router.push('/admin/candidates')}>Candidates link</button><RouteFeedback/><Suspense fallback={<p>Initial bootstrap</p>}><Page next={next}/></Suspense></>;}
  render(<NavigationProvider><Fixture/></NavigationProvider>);
  fireEvent.click(screen.getByText('Candidates link'));
  expect(screen.getByRole('heading',{name:'Dashboard'})).toBeTruthy();
  expect(screen.getByRole('status').textContent).toBe('Opening page…');
  expect(screen.queryByText('Initial bootstrap')).toBeNull();
  await act(async()=>release());
  expect(screen.getByRole('heading',{name:'Candidates'})).toBeTruthy();
  expect(screen.queryByRole('status')).toBeNull();
});
it('replaces a stalled spinner with an explicit navigation-only retry',async()=>{
  vi.useFakeTimers();const waiting=new Promise(()=>{});
  function Page({next}){if(next)throw waiting;return <h1>Dashboard</h1>;}
  function Fixture(){const [next,setNext]=useState(false);state.push.mockImplementation(()=>setNext(true));const router=useRouter();return <><button onClick={()=>router.push('/admin/candidates')}>Open</button><RouteFeedback/><Suspense fallback="Initial"><Page next={next}/></Suspense></>;}
  render(<NavigationProvider><Fixture/></NavigationProvider>);
  fireEvent.click(screen.getByText('Open'));
  await act(()=>vi.advanceTimersByTimeAsync(20000));
  expect(screen.queryByText('Opening page…')).toBeNull();
  expect(screen.getByRole('heading',{name:'Dashboard'})).toBeTruthy();
  fireEvent.click(screen.getByRole('button',{name:'Retry page'}));
  expect(state.push).toHaveBeenCalledTimes(2);
  expect(screen.getByText('Opening page…')).toBeTruthy();
});
