import React from "react";
import { Navigate, useParams } from "react-router-dom";
import LegalLayout from "./LegalLayout";
import LegalDocument from "../../components/legal/LegalDocument";

// /legal/terms, /legal/privacy, /legal/cookies, /legal/notice (Phase 4b):
// the current published version of a policy, edited in Settings → Content.
// Public: works signed in or out. The in-app copy is pages/docs/PolicyDoc.jsx.
export default function LegalPage() {
  const { page } = useParams();

  return (
    <LegalDocument page={page}>
      {({ found, title, meta, notice, actions, bodyKey, body }) =>
        !found ? (
          <Navigate to="/legal/terms" replace />
        ) : (
          <LegalLayout title={title} meta={meta} notice={notice} headerActions={actions} bodyKey={bodyKey}>
            {body}
          </LegalLayout>
        )
      }
    </LegalDocument>
  );
}
