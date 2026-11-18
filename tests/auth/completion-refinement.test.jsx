import { afterEach, expect, it, vi } from "vitest";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
const state = vi.hoisted(()=>({status:"SUBMITTED",mutate:vi.fn(),failed:false}));
vi.mock("@/lib/config/environment",()=>({isApiMode:true}));
vi.mock("@/components/candidate/shell",()=>({CandidateShell:({children})=><>{children}</>}));
vi.mock("@/components/candidate/completion-media-status",()=>({CompletionMediaStatus:()=> <p>Separate recording status</p>}));
vi.mock("@/components/candidate/flow-gate",()=>({useFlowGate:()=>null}));
vi.mock("@/lib/data/candidate-flow",()=>({useCandidateFlow:()=>({interviewId:"fictional-id",candidateName:"Fictional Candidate"}),clearPreChecks:vi.fn()}));
vi.mock("@/lib/data/queries",()=>({useMyInterview:()=>({candidate:{fullName:"Fictional Candidate"},current:{application:{stage:{key:"ai_interview_completed",label:"AI Interview Completed"}}}}),useProgress:()=>({data:{interviewId:"fictional-id",status:state.status,reference:null,jobRole:{title:"CSR Fresher"},submittedAt:"2026-11-19T10:00:00Z",completedQuestions:4,totalQuestions:4}}),useSubmitInterview:()=>({mutate:state.mutate,isPending:false,isError:state.failed})}));
import CompletePage from "@/app/candidate/interview/complete/page";
afterEach(()=>{cleanup();state.status="SUBMITTED";state.failed=false;state.mutate.mockClear();});
it("shows success only after submission and never invents a reference or creates another interview",()=>{
  render(<CompletePage/>);
  expect(screen.getByRole("heading",{name:"Your Interview Has Been Successfully Submitted"})).toBeTruthy();
  expect(screen.getByText("Awaiting HR Review")).toBeTruthy();
  expect(screen.queryByText("Interview reference")).toBeNull();
  expect(screen.getByText("Separate recording status")).toBeTruthy();
  expect(state.mutate).not.toHaveBeenCalled();
});
it("does not show success on a pending or failed submission",async()=>{
  state.status="COMPLETED";state.failed=true; render(<CompletePage/>);
  await waitFor(()=>expect(state.mutate).toHaveBeenCalledTimes(1));
  expect(screen.queryByRole("heading",{name:"Your Interview Has Been Successfully Submitted"})).toBeNull();
  expect(screen.getByRole("button",{name:/Try Again/})).toBeTruthy();
});
