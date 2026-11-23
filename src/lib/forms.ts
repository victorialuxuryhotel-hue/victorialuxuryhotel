import { startTransition, type FormEvent } from "react";

export function keepValues(formAction: (formData: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const submitter = (event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement | null;
    const formData = new FormData(event.currentTarget, submitter);
    startTransition(() => formAction(formData));
  };
}
