import { Link } from 'react-router-dom'

const roles = [
  {
    to: '/farmer',
    title: 'I have a harvest',
    description: 'See your recommended buyers, ranked by expected net realization — not just price.',
    cta: 'Enter as farmer',
    enabled: true,
  },
  {
    to: '/shop',
    title: 'I need to buy produce',
    description: 'See ranked suppliers by expected landed cost — transport and spoilage included.',
    cta: 'Enter as shopkeeper',
    enabled: true,
  },
  {
    to: '/transport',
    title: 'I run transport',
    description: 'List your routes and capacity, see which confirmed deals you’re carrying.',
    cta: 'Coming next',
    enabled: false,
  },
]

export default function Landing() {
  return (
    <main className="mx-auto max-w-4xl px-6 py-16">
      <div className="text-center mb-12">
        <h2 className="text-2xl font-semibold mb-2">Who are you?</h2>
        <p className="text-neutral-500">
          The highest price isn't always the highest profit. FarmSync calculates the deal with the best
          expected outcome for both sides.
        </p>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {roles.map((role) =>
          role.enabled ? (
            <Link
              key={role.to}
              to={role.to}
              className="block border border-neutral-200 bg-white rounded-xl p-6 hover:border-neutral-400 hover:shadow-sm transition"
            >
              <h3 className="font-semibold mb-2">{role.title}</h3>
              <p className="text-sm text-neutral-500 mb-4">{role.description}</p>
              <span className="text-sm font-medium text-emerald-700">{role.cta} →</span>
            </Link>
          ) : (
            <div key={role.to} className="border border-dashed border-neutral-200 rounded-xl p-6 opacity-60">
              <h3 className="font-semibold mb-2">{role.title}</h3>
              <p className="text-sm text-neutral-500 mb-4">{role.description}</p>
              <span className="text-sm font-medium text-neutral-400">{role.cta}</span>
            </div>
          ),
        )}
      </div>
    </main>
  )
}
