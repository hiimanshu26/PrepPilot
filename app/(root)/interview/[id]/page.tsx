import { db } from "@/firebase/admin";
import InterviewRunner from "@/components/InterviewRunner";

export default async function InterviewSessionPage({
                                                       params,
                                                   }: {
    params: Promise<{ id: string }>;
}) {
    const { id } = await params;

    if (!id) {
        return <div className="p-6">Invalid interview id.</div>;
    }

    const snap = await db.collection("interviews").doc(id).get();

    if (!snap.exists) {
        return <div className="p-6">Interview not found.</div>;
    }

    const data = snap.data() as any;

    return (
        <div className="p-6 max-w-3xl mx-auto">
            <h1 className="text-2xl font-semibold">
                {data.role} • {data.level}
            </h1>
            <p className="opacity-70 mt-1">{data.interviewType} Interview</p>

            <div className="mt-6">
                <InterviewRunner
                    interviewId={id}
                    questions={data.questions || []}
                    meta={{
                        role: data.role,
                        level: data.level,
                        interviewType: data.interviewType,
                    }}
                />
            </div>
        </div>
    );
}
