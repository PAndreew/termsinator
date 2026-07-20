export interface ContributorIdentity {
  readonly publicKey: JsonWebKey;
  readonly privateKey: JsonWebKey;
  readonly registrations: Readonly<Record<string, string>>;
}
