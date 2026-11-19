import { Controller, Get, Query } from "@nestjs/common";
import { RequirePermissions } from "../../common/decorators";
import { PERMISSIONS as P } from "../../common/constants/permissions";
import { UsageHistoryQuery, UsageOverviewQuery } from "./api-usage.dto";
import { ApiUsageService } from "./api-usage.service";
import { ProviderMetadataService } from "./provider-metadata.service";

@Controller("api-usage")
@RequirePermissions(P.USERS_MANAGE)
export class ApiUsageController {
  constructor(private readonly usage: ApiUsageService, private readonly metadata: ProviderMetadataService) {}
  @Get("overview") overview(@Query() query: UsageOverviewQuery) { return this.usage.overview(query); }
  @Get("history") history(@Query() query: UsageHistoryQuery) { return this.usage.history(query); }
  @Get("provider") provider() { return this.metadata.get(); }
}
