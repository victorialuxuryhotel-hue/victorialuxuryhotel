import { startTransition, type FormEvent } from "react";

/**
 * React 19 resets a form's fields after its server action runs, even when the
 * server returns a validation error, so people would lose what they typed.
 * Submitting through this handler keeps their input. Without JavaScript the
 * form still posts normally via its `action`.
 */
export function keepValues(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  };
}
