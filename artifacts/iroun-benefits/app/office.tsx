import React, { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { getGetOfficeStateQueryKey } from '@workspace/api-client-react';
import { Chip, Notice, Page, Wrap } from '@/components/ui';
import { Pending, AuthGate, QueryProblem,NotGovernment } from '@/components/service-ui';
import { OfficeContact } from '@/components/office/OfficeContact';
import { OfficeContracts } from '@/components/office/OfficeContracts';
import { OfficeInquiries } from '@/components/office/OfficeInquiries';
import { OfficeRequests } from '@/components/office/OfficeRequests';
import { OfficeStaff } from '@/components/office/OfficeStaff';
import { useOfficeView } from '@/lib/service';

type Tab = 'requests' | 'contracts' | 'staff' | 'contact' | 'inquiries';

function Body() {
  const qc = useQueryClient();
  const { data, error, isLoading, refetch, denied } = useOfficeView();
  const [tab, setTab] = useState<Tab>('requests');
  if (denied) return <Notice tone="error" title="볼 수 없습니다">회사 업무 화면은 관리자와 직원만 볼 수 있습니다.</Notice>;
  if (error) return <QueryProblem error={error} next="/office" onRetry={() => refetch()} forbidden="회사 업무 화면은 관리자와 직원만 볼 수 있습니다." />;
  if (isLoading || !data) return <Pending onRetry={() => refetch()} />;
  const refresh = () => qc.invalidateQueries({ queryKey: getGetOfficeStateQueryKey() });
  const tabs: [Tab, string][] = [['requests', '접수'], ...(data.admin ? [['contracts', '계약'], ['staff', '직원']] as [Tab, string][] : []), ['contact', '연락처'], ['inquiries', '문의']];
  const cur = tabs.some((t) => t[0] === tab) ? tab : 'requests';
  const p = { o: data, refresh };
  return (
    <>
      <Notice tone="info">{data.admin ? '관리자로 전체 업무를 봅니다.' : '직원으로 배정된 업무만 봅니다.'}</Notice>
      <Wrap>{tabs.map(([k, l]) => <Chip key={k} label={l} selected={cur === k} onPress={() => setTab(k)} testID={`office-tab-${k}`} />)}</Wrap>
      {cur === 'requests' ? <OfficeRequests {...p} /> : null}
      {cur === 'contracts' ? <OfficeContracts {...p} /> : null}
      {cur === 'staff' ? <OfficeStaff {...p} /> : null}
      {cur === 'contact' ? <OfficeContact {...p} /> : null}
      {cur === 'inquiries' ? <OfficeInquiries {...p} /> : null}
    </>
  );
}

export default function Office() {
  return (
    <Page back title="회사 업무" subtitle="고객 접수와 문의를 처리합니다.">
      <NotGovernment />
      <AuthGate next="/office"><Body /></AuthGate>
    </Page>
  );
}
