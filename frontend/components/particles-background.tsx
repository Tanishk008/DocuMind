"use client";

import { useEffect, useState, memo } from "react";
import Particles, { initParticlesEngine } from "@tsparticles/react";
import { loadSlim } from "@tsparticles/slim";
import { useTheme } from "next-themes";

const ParticlesBackground = memo(function ParticlesBackground() {
  const [init, setInit] = useState(false);
  const { theme, systemTheme } = useTheme();

  // Determine if it's dark mode to adjust particle colors
  const currentTheme = theme === "system" ? systemTheme : theme;
  const isDark = currentTheme === "dark";

  useEffect(() => {
    initParticlesEngine(async (engine) => {
      // Load the slim version for optimal performance and size
      await loadSlim(engine);
    }).then(() => {
      setInit(true);
    });
  }, []);

  if (!init) {
    return null;
  }

  return (
    <Particles
      id="tsparticles"
      className="absolute inset-0 z-0 pointer-events-auto"
      options={{
        background: {
          color: {
            value: "transparent",
          },
        },
        fpsLimit: 120,
        interactivity: {
          events: {
            onClick: {
              enable: true,
              mode: "push",
            },
            onHover: {
              enable: true,
              mode: "grab", // Connects lines to the mouse
            },
            resize: {
              enable: true,
              delay: 0.5,
            },
          },
          modes: {
            grab: {
              distance: 200,
              links: {
                opacity: 0.8,
              },
            },
            push: {
              quantity: 4,
            },
            repulse: {
              distance: 200,
              duration: 0.4,
            },
          },
        },
        particles: {
          color: {
            // A subtle blueish-purple for dark mode, darker blue for light mode
            value: isDark ? "#818cf8" : "#3b82f6",
          },
          links: {
            color: isDark ? "#818cf8" : "#3b82f6",
            distance: 150,
            enable: true,
            opacity: 0.4,
            width: 1,
          },
          move: {
            direction: "none",
            enable: true,
            outModes: {
              default: "bounce",
            },
            random: false,
            speed: 1,
            straight: false,
          },
          number: {
            density: {
              enable: true,
              width: 800,
              height: 800,
            },
            value: 80, // Number of particles
          },
          opacity: {
            value: 0.5,
          },
          shape: {
            type: "circle",
          },
          size: {
            value: { min: 1, max: 3 },
          },
        },
        detectRetina: true,
      }}
    />
  );
});

export default ParticlesBackground;
