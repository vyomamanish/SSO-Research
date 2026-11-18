export function Groups({ groups }: { groups: string[] }) {
  if (groups.length === 0) return <p className="muted">No groups</p>;

  return (
    <ul className="groups" aria-label="Groups">
      {groups.map((group) => (
        <li key={group}>{group}</li>
      ))}
    </ul>
  );
}
