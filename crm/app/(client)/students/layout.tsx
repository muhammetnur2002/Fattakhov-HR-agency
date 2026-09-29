import { StudentsTabs } from "./students-tabs";

export default function StudentsLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="space-y-5">
      <StudentsTabs />
      {children}
    </div>
  );
}
