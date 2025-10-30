import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Tailwind,
  Text,
} from "@react-email/components"

export type UserInvitedEmailProps = {
  invite_url: string
  email?: string
}

export function UserInvitedEmailComponent({
  invite_url,
  email,
}: UserInvitedEmailProps) {
  return (
    <Html>
      <Head />
      <Preview>You've been invited to join our platform</Preview>
      <Tailwind>
        <Body className="bg-white mx-auto my-auto px-4 font-sans">
          <Container className="my-10 w-full max-w-[465px] rounded border border-solid border-[#eaeaea] p-6">
            <Section className="mt-8 text-center">
              <Heading className="m-0 text-[24px] font-normal text-black">
                You&apos;re Invited!
              </Heading>
            </Section>

            <Section className="my-8 space-y-4">
              <Text className="m-0 text-[14px] leading-6 text-black">
                Hello{email ? ` ${email}` : ""},
              </Text>
              <Text className="m-0 text-[14px] leading-6 text-black">
                You&apos;ve been invited to join our platform. Click the button
                below to accept your invitation and set up your account.
              </Text>
            </Section>

            <Section className="my-8 text-center">
              <Button
                href={invite_url}
                className="rounded bg-black px-5 py-3 text-center text-[12px] font-semibold text-white no-underline"
              >
                Accept Invitation
              </Button>
            </Section>

            <Section className="my-8 space-y-4">
              <Text className="m-0 text-[14px] leading-6 text-black">
                Or copy and paste this URL into your browser:
              </Text>
              <Link
                href={invite_url}
                className="break-all text-[14px] leading-6 text-blue-600 no-underline"
              >
                {invite_url}
              </Link>
            </Section>

            <Section className="mt-8">
              <Text className="m-0 text-[12px] leading-6 text-[#666666]">
                If you weren&apos;t expecting this invitation, you can ignore
                this email.
              </Text>
            </Section>
          </Container>
        </Body>
      </Tailwind>
    </Html>
  )
}

export const userInvitedEmail = (props: UserInvitedEmailProps) => (
  <UserInvitedEmailComponent {...props} />
)

const mockInvite: UserInvitedEmailProps = {
  invite_url: "https://your-app.com/app/invite/sample-token-123",
  email: "user@example.com",
}

// @ts-ignore - consumed by React Email dev server
export default () => <UserInvitedEmailComponent {...mockInvite} />
