import { runGlints } from "../src/run";

async function main() {
  const result = await runGlints({
    selectedCountry: "indonesia",
    searchTerms: ["software engineer"],
    maxJobsPerTerm: 3,
    onProgress: (event) => console.log("progress", event),
  });

  console.log(
    JSON.stringify(
      {
        success: result.success,
        error: result.error,
        challengeRequired: result.challengeRequired,
        jobCount: result.jobs.length,
        sample: result.jobs.slice(0, 2).map((job) => ({
          title: job.title,
          employer: job.employer,
          url: job.jobUrl,
        })),
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
