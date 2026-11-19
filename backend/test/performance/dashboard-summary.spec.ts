import "reflect-metadata";
import { AnalyticsController } from "../../src/modules/analytics/analytics.module";
import { PERMISSIONS } from "../../src/common/constants/permissions";
import { ResponseEnvelopeInterceptor } from "../../src/common/http";
import { firstValueFrom, of } from "rxjs";

describe("bounded dashboard metrics", () => {
  it.each(["production", "development"])("keeps count semantics and sample policy in %s", async env => {
    const candidateCount = jest.fn().mockResolvedValueOnce(12).mockResolvedValueOnce(2);
    const interviewCount = jest.fn().mockResolvedValue(7);
    const reviewCount = jest.fn().mockResolvedValue(3);
    const controller = new AnalyticsController({ candidate:{count:candidateCount},interviewSession:{count:interviewCount},hrReview:{count:reviewCount} } as never, {get:()=>env} as never);
    const result = await controller.summary();
    expect(result).toEqual({includeSample:env!=="production",candidates:{total:12,selected:2},interviews:{completed:7},reviews:{pending:3}});
    expect(candidateCount).toHaveBeenCalledTimes(2);
    expect(interviewCount).toHaveBeenCalledTimes(1);
    expect(reviewCount).toHaveBeenCalledTimes(1);
    expect(candidateCount.mock.calls[0][0].where).toEqual(env === "production" ? {isSample:false} : {});
    expect(candidateCount.mock.calls[1][0].where.applications.some.status.in).toContain("JOINED");
    expect(interviewCount.mock.calls[0][0].where.status).toBe("SUBMITTED");
  });
  it("requires the same analytics permission as the full overview", () => {
    const metadata = Reflect.getMetadataKeys(AnalyticsController.prototype.overview);
    const key = metadata.find(k => JSON.stringify(Reflect.getMetadata(k,AnalyticsController.prototype.overview)) === JSON.stringify([PERMISSIONS.ANALYTICS_READ]));
    expect(key).toBeDefined();
    expect(Reflect.getMetadata(key!,AnalyticsController.prototype.summary)).toEqual([PERMISSIONS.ANALYTICS_READ]);
  });
  it("adds numeric timing without exposing request contents", async () => {
    const setHeader = jest.fn();
    const ctx = {switchToHttp:()=>({getRequest:()=>({id:'fictional-id',headers:{cookie:'not-for-output'}}),getResponse:()=>({setHeader})})};
    const result = await firstValueFrom(new ResponseEnvelopeInterceptor().intercept(ctx as never,{handle:()=>of({count:4})}));
    expect(result).toEqual({success:true,data:{count:4},meta:{requestId:'fictional-id'}});
    expect(setHeader).toHaveBeenCalledWith('Server-Timing',expect.stringMatching(/^handler;dur=\d+\.\d$/));
  });
});
