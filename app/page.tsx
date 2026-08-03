import { currentUser } from "@clerk/nextjs/server";
import Link from "next/link";
import { getOrCreateUser, getStudentSnapshot, getSyllabusNodes } from "@/lib/student-model";

export default async function DashboardPage() {
  const user = await currentUser();

  if (!user) {
    return (
      <div className="card">
        <p>
          <Link href="/sign-in">Sign in</Link> to see your learning dashboard.
        </p>
      </div>
    );
  }

  const primaryEmail = user.emailAddresses.find(
    (address) => address.id === user.primaryEmailAddressId,
  )?.emailAddress;
  await getOrCreateUser(user.id, primaryEmail ?? "");

  const snapshot = await getStudentSnapshot(user.id);
  const nodes = snapshot.activeNode
    ? await getSyllabusNodes(user.id, snapshot.activeNode.syllabusId)
    : [];

  return (
    <div>
      <section className="card">
        <h2>Goal</h2>
        {snapshot.goal ? (
          <p>{snapshot.goal.title}</p>
        ) : (
          <p>
            No active goal yet. Tell the <Link href="/chat">Mentor</Link> what you want to
            learn to get started.
          </p>
        )}
      </section>

      <section className="card">
        <h2>Syllabus</h2>
        {nodes.length === 0 ? (
          <p>No syllabus yet.</p>
        ) : (
          <div className="node-list">
            {nodes.map((node) => (
              <div className="node-row" key={node.id}>
                <span>{node.title}</span>
                <span className="badge">{node.status.replace("_", " ")}</span>
              </div>
            ))}
          </div>
        )}
      </section>

      <section className="card">
        <h2>Skills</h2>
        {snapshot.skills.length === 0 ? (
          <p>No skill signal recorded yet.</p>
        ) : (
          <div className="node-list">
            {snapshot.skills.map((skill) => (
              <div className="node-row" key={skill.id}>
                <span>{skill.name}</span>
                <span className="badge">{skill.masteryLevel}/100</span>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
