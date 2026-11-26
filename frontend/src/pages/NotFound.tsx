import { Link } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { MunicipalPanel } from '../components/ui/Primitives';

export function NotFound() {
  return (
    <div className="max-w-lg mx-auto py-12">
      <MunicipalPanel
        title="404 — Page Not Found"
        icon={<AlertCircle className="w-4 h-4" />}
        bodyClassName="p-6 text-center space-y-4"
      >
        <div className="text-3xl font-bold font-mono text-[#173C79]">404</div>
        <h1 className="font-heading text-lg font-bold text-[#26364A]">
          Requested Portal Route Does Not Exist
        </h1>
        <p className="text-xs text-[#5A6A7E] leading-relaxed">
          The URL you navigated to is not part of the FloodForgeAI municipal monitoring portal. Return to the main Dashboard to inspect live Nullah Lai basin conditions.
        </p>
        <Link
          to="/"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-sm bg-[#173C79] hover:bg-[#244D8F] text-white text-xs font-semibold transition-colors"
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Return to Dashboard
        </Link>
      </MunicipalPanel>
    </div>
  );
}
