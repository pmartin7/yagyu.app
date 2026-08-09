import { Card } from '../components/ui/card.js';

export function TasksPage(): JSX.Element {
  return (
    <div className="flex-1 flex items-center justify-center px-4 py-16">
      <Card className="w-full max-w-sm p-8 text-center">
        <h1 className="font-display text-2xl font-semibold text-ink tracking-tight">No tasks</h1>
        <p className="mt-3 text-ink-muted leading-relaxed">
          Todos generated from your inbox will show up here.
        </p>
      </Card>
    </div>
  );
}
