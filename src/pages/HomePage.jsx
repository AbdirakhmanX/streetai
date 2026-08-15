import Nav from "../components/Nav.jsx";
import Hero from "../components/Hero.jsx";
import Problem from "../components/Problem.jsx";
import HowItWorks from "../components/HowItWorks.jsx";
import DashboardSection from "../components/DashboardSection.jsx";
import CTAFooter from "../components/CTAFooter.jsx";

export default function HomePage() {
  return (
    <div className="font-body">
      <Nav />
      <Hero />
      <Problem />
      <HowItWorks />
      <DashboardSection />
      <CTAFooter />
    </div>
  );
}
