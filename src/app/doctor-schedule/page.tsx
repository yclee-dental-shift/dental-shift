import Link from "next/link";

/** 醫師班表已搬到排班工作台的第一步「醫師與人數」；保留舊網址，避免書籤打不開。 */
export default function DoctorSchedulePage() {
  return (
    <main className="page-shell">
      <h1 className="page-title">醫師班表</h1>
      <p className="page-intro">醫師班表已經搬到「排班工作台」的第一步「醫師與人數」：每天的醫師、固定班、來診日、休診日都在那裡修改。</p>
      <Link className="button" href="/workbench">到排班工作台</Link>
    </main>
  );
}
