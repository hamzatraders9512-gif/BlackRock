import React from 'react'
import { motion } from 'framer-motion'
import './AboutInvestment.css'

const page = {
  hidden: { opacity: 0, y: 8 },
  enter: { opacity: 1, y: 0, transition: { duration: 0.6, ease: 'easeOut' } },
}

const card = {
  hidden: { opacity: 0, y: 18 },
  visible: (i = 1) => ({ opacity: 1, y: 0, transition: { delay: 0.08 * i, duration: 0.6, ease: 'easeOut' } }),
}

export default function AboutInvestment(): JSX.Element {
  const cards = [
    {
      title: 'Purpose of Investment',
      emoji: '🚀',
      text: 'Deposit funds that are professionally managed. Daily profit sharing based on your deposited balance — simple, automated, no manual trading required.',
    },
    {
      title: 'Investment Model',
      emoji: '📊',
      text: 'Deposit → Pool capital → Professional traders execute trades → Profits generated and shared. Typical daily profit sharing: 4%–8%.',
    },
    {
      title: 'Trading Strategy',
      emoji: '💼',
      text: 'Trading is handled by experienced professionals and limited to Gold (XAU/USD) and Bitcoin (BTC) to prioritise liquidity and consistency.',
    },
    {
      title: 'Risk Management',
      emoji: '🛡️',
      text: 'Advanced stop-loss discipline, position sizing, and exposure control to prioritise sustainable growth over aggressive risk-taking.',
    },
    {
      title: 'Daily Profit Distribution',
      emoji: '💸',
      text: 'Profits are calculated and credited daily. Track earnings in real time — profits are proportional to your investment balance.',
    },
    {
      title: 'Transparency & Control',
      emoji: '⚖️',
      text: 'View deposit history, daily profits, and account performance. We prioritise fairness and accountability.',
    },
  ]

  return (
    <motion.div className="about-wrap" initial="hidden" animate="enter" variants={page}>
      <div className="container">
        <header className="hero">
          <motion.h1 className="title" initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0, transition: { delay: 0.08 } }}>
            About Our Investment Platform
          </motion.h1>
          <motion.p className="subtitle" initial={{ opacity: 0 }} animate={{ opacity: 1, transition: { delay: 0.16 } }}>
            We operate a professionally managed investment ecosystem where investors deposit capital into pooled strategies executed by an experienced trading desk.
            Investors receive a proportional share of realized trading profits daily. Our approach is engineered for transparency, consistency, and long-term capital preservation.
          </motion.p>
        </header>

        <section className="grid-overview">
          <motion.div className="overview-card" variants={card} custom={0} initial="hidden" animate="visible">
            <h3>Purpose & Value Proposition</h3>
            <p>
              The platform enables investors to allocate capital into professionally-managed strategies without active trading. Deposited funds are pooled,
              deployed by a dedicated trading team, and profits are measured and distributed to investors each day based on their account balance.
              This model simplifies access to institutional-style trading while giving investors clear visibility into performance and distributions.
            </p>
            <h4 style={{marginTop:12}}>Key Benefits</h4>
            <ol>
              <li>Professional portfolio management focused on consistency and liquidity.</li>
              <li>Daily profit distribution aligned to investor balances (typical range: 4%–8% daily, variable by market conditions).</li>
              <li>Strict asset focus and risk controls to preserve capital and compound returns.</li>
            </ol>
            <p className="muted">*Daily ranges vary by market conditions and are not guaranteed. See the legal notice for full risk disclosure.</p>
          </motion.div>

          <div className="cards-grid">
            {cards.map((c, i) => (
              <motion.article key={c.title} className="glass-card" custom={i} initial="hidden" animate="visible" variants={card}>
                <div className="card-head">
                  <div className="emoji">{c.emoji}</div>
                  <h4>{c.title}</h4>
                </div>
                <p className="card-body">{c.text}</p>
              </motion.article>
            ))}
          </div>
        </section>

        <section className="legal">
          <h5>Legal Disclaimer & Risk Notice ⚠️</h5>
          <p>
            Trading involves significant risk. While our trading desk aims to generate consistent returns, profits are not guaranteed and past performance does not indicate future results.
            Investors should understand the inherent risks of leveraged markets, market gaps, and volatility. This platform provides information and execution services but does not constitute personalized financial advice.
            Participation is at the investor's own risk. Review our full terms and consult a licensed advisor for individualized guidance.
          </p>
        </section>
      </div>
    </motion.div>
  )
}
