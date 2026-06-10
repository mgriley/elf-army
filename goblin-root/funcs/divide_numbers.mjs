export async function handle(input, libs) {
  const { a, b } = input;
  if (b === 0) {
    throw new Error("Division by zero is not allowed.");
  }
  return { result: a / b };
}
