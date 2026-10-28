import { ImportWizard } from "@/components/upload/ImportWizard";

export default function ImportPage() {
  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold tracking-tight text-ink">데이터 가져오기</h1>
        <p className="mt-1 text-sm text-ink2">
          파일은 브라우저 안에서만 처리되며 서버로 전송되지 않습니다. 등록 전에 컬럼 타입과 품질 리포트를 확인하세요.
        </p>
      </div>
      <ImportWizard />
    </div>
  );
}
