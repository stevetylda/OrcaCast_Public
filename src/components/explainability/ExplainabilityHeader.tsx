type Props = {
  title?: string;
};

export function ExplainabilityHeader({
  title = "Explainability",
}: Props) {
  return (
    <section className="explainabilityHeader pageSection">
      <div className="explainabilityHeader__top">
        <div className="explainabilityHeader__titleRow">
          <h2>{title}</h2>
        </div>
      </div>
    </section>
  );
}
