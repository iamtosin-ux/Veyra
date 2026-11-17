import type { DemoScenario } from "../types";
import { socialHousing } from "./social-housing";
import { hrInvestigation } from "./hr-investigation";
import { propertyManagement } from "./property-management";
import { insuranceClaim } from "./insurance-claim";
import { legalServices } from "./legal-services";
import { healthSocialCare } from "./health-social-care";
import { constructionDispute } from "./construction-dispute";
import { healthcare } from "./healthcare";
import { commercialContract } from "./commercial-contract";
import { financialServices } from "./financial-services";
import { rentArrears } from "./rent-arrears";
import { energy } from "./energy";

/** Demo scenarios, one per target industry. All synthetic; analysis hand-written. */
export const SCENARIOS: DemoScenario[] = [socialHousing, hrInvestigation, propertyManagement, insuranceClaim, legalServices, healthSocialCare, constructionDispute, healthcare, commercialContract, financialServices, rentArrears, energy];

export function getScenario(id: string): DemoScenario | undefined {
  return SCENARIOS.find((s) => s.id === id);
}
