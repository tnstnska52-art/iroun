type Notice = { id?: unknown; title?: unknown };
type Access = { active?: boolean; contractActive?: boolean };

/** 사장님 본인의 고용보험 사업만 구분한다. 직원 보험료·고용장려금은 포함하지 않는다. */
export function requiresPackageContract(benefit: Notice): boolean {
  if (benefit.id === "standing-self-employed-insurance") return true;
  const title = String(benefit.title ?? "").replace(/\s/g, "");
  return /고용보험/.test(title) && /자영업|소상공인/.test(title) && !/근로자|직원|두루누리/.test(title);
}

export function visibleToCustomer(benefit: Notice, access?: Access): boolean {
  return !requiresPackageContract(benefit) || (access?.active === true && access.contractActive === true);
}
